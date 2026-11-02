"""Inbjudan av handledare, företagsprofil, kollegor och notiser."""

import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import time
from app.models.invitation import Invitation
from app.models.placement import Workplace
from app.models.school import School
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]

COMPANY = {
    "name": "  Elbolaget AB ",
    "address": "Storgatan 1, Kramfors",
    "industry": "El",
    "description": "Vi installerar el i hus och lokaler.",
}


@dataclass
class World:
    teacher: User
    other_teacher: User
    admin: User
    umea_teacher: User
    student: User
    ee22: SchoolClass


@pytest.fixture
def mail() -> Iterator[MagicMock]:
    with patch("app.api.routes.invitations.send_email") as send:
        yield send


@pytest.fixture
def world(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> World:
    kramfors, umea = make_school("Kramforsskolan"), make_school("Umeåskolan")
    teacher = make_user(email="ingrid@kramfors.se", in_school=kramfors)
    other = make_user(email="per@kramfors.se", in_school=kramfors)
    admin = make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors)
    umea_teacher = make_user(email="anders@umea.se", in_school=umea)
    student = make_user(email="hugo@kramfors.se", role=UserRole.STUDENT, in_school=kramfors)
    ee22 = SchoolClass(school_id=kramfors.id, name="EE22", teachers=[teacher], students=[student])
    db.add(ee22)
    db.flush()
    return World(teacher, other, admin, umea_teacher, student, ee22)


def token_from(mail: MagicMock) -> str:
    """Token ur länken i det senaste mejlet."""
    body = mail.call_args.args[2]
    match = re.search(r"/invite/([A-Za-z0-9_-]+)", body)
    assert match, body
    return match.group(1)


def invite(client: TestClient, mail: MagicMock, email: str = "gustav@elbolaget.se") -> str:
    response = client.post("/api/invitations", json={"email": email})
    assert response.status_code == 201, response.text
    return token_from(mail)


def accept(client: TestClient, token: str, company: dict | None = COMPANY, **extra: object):  # noqa: ANN201
    body = {"name": "Gustav Lindahl", "password": "ett-langt-losenord", **extra}
    if company is not None:
        body["company"] = company
    return client.post(f"/api/invite/{token}/accept", json=body)


# --- Läraren bjuder in ---------------------------------------------------------------------


def test_teacher_invites_supervisor(
    client: TestClient, login: Login, world: World, mail: MagicMock, db: Session
) -> None:
    login(world.teacher)
    response = client.post("/api/invitations", json={"email": " Gustav@Elbolaget.se "})
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "gustav@elbolaget.se"
    assert body["status"] == "pending"
    to, subject, text = mail.call_args.args
    assert to == "gustav@elbolaget.se"
    assert "Kramforsskolan" in text
    # Länken bär en slumpad token, ingen e-post eller id i klartext.
    token = token_from(mail)
    assert "gustav" not in token and body["id"] not in text
    # Bara hashen sparas.
    stored = db.scalar(select(Invitation.token_hash))
    assert stored != token and len(stored) == 64


def test_list_shows_latest_per_email(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    login(world.teacher)
    old = invite(client, mail)
    invite(client, mail)
    invite(client, mail, "anna@bygg.se")
    listed = client.get("/api/invitations").json()
    assert [i["email"] for i in listed] == ["anna@bygg.se", "gustav@elbolaget.se"]
    # Den första länken ersattes av den andra.
    assert client.get(f"/api/invite/{old}").status_code == 404


def test_other_teacher_does_not_see_invitations(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    login(world.teacher)
    invite(client, mail)
    login(world.other_teacher)
    assert client.get("/api/invitations").json() == []


def test_cannot_invite_other_role_email(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    login(world.teacher)
    response = client.post("/api/invitations", json={"email": "hugo@kramfors.se"})
    assert response.status_code == 409
    mail.assert_not_called()


def test_invalid_email(client: TestClient, login: Login, world: World, mail: MagicMock) -> None:
    login(world.teacher)
    assert client.post("/api/invitations", json={"email": "inte en adress"}).status_code == 422


@pytest.mark.parametrize("role", [UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.PRINCIPAL])
def test_other_roles_cannot_invite(
    client: TestClient, login: Login, make_user: MakeUser, world: World, role: UserRole, mail
) -> None:
    login(make_user(email="x@x.se", role=role, in_school=None))
    assert client.post("/api/invitations", json={"email": "a@b.se"}).status_code == 403


def test_resend_and_revoke(client: TestClient, login: Login, world: World, mail: MagicMock) -> None:
    login(world.teacher)
    first = invite(client, mail)
    invitation_id = client.get("/api/invitations").json()[0]["id"]

    resent = client.post(f"/api/invitations/{invitation_id}/resend")
    assert resent.status_code == 200
    second = token_from(mail)
    assert second != first
    assert client.get(f"/api/invite/{first}").status_code == 404
    assert client.get(f"/api/invite/{second}").status_code == 200

    assert client.delete(f"/api/invitations/{invitation_id}").status_code == 204
    assert client.get(f"/api/invite/{second}").status_code == 404
    assert client.get("/api/invitations").json()[0]["status"] == "revoked"

    login(world.other_teacher)
    assert client.delete(f"/api/invitations/{invitation_id}").status_code == 404


# --- Handledaren tackar ja -----------------------------------------------------------------


def test_preview(client: TestClient, login: Login, world: World, mail: MagicMock) -> None:
    login(world.teacher)
    token = invite(client, mail)
    client.post("/api/auth/logout")
    preview = client.get(f"/api/invite/{token}")
    assert preview.status_code == 200
    assert preview.json() == {
        "kind": "supervisor",
        "email": "gustav@elbolaget.se",
        "invited_by_name": "Testperson",
        "school_name": "Kramforsskolan",
        "workplace_name": None,
        "existing_workplace_name": None,
        "has_account": False,
        "account_name": None,
    }


def test_unknown_token(client: TestClient) -> None:
    assert client.get("/api/invite/finns-inte").status_code == 404


def test_accept_creates_account_company_and_notifies(
    client: TestClient, login: Login, world: World, mail: MagicMock, db: Session
) -> None:
    login(world.teacher)
    token = invite(client, mail)
    client.post("/api/auth/logout")

    response = accept(client, token)
    assert response.status_code == 200, response.text
    assert response.json()["role"] == "supervisor"
    # Handledaren är inloggad.
    assert client.get("/api/auth/me").json()["email"] == "gustav@elbolaget.se"
    company = client.get("/api/supervisor/workplaces").json()
    assert [(w["name"], w["industry"], w["school_names"]) for w in company] == [
        ("Elbolaget AB", "El", ["Kramforsskolan"])
    ]
    assert [s["name"] for s in company[0]["supervisors"]] == ["Gustav Lindahl"]

    # Länken går inte att använda igen.
    assert accept(client, token).status_code == 404

    # Läraren har en notis och ser företaget. Andra lärare ser det inte.
    login(world.teacher)
    notes = client.get("/api/notifications").json()
    assert notes["unread"] == 1
    assert "Elbolaget AB" in notes["items"][0]["text"]
    assert notes["items"][0]["link"] == "/placements"
    assert [w["name"] for w in client.get("/api/workplaces").json()] == ["Elbolaget AB"]
    assert client.get("/api/invitations").json()[0]["status"] == "accepted"
    assert client.get("/api/invitations").json()[0]["workplace_name"] == "Elbolaget AB"
    assert client.post("/api/notifications/read").status_code == 204
    assert client.get("/api/notifications").json()["unread"] == 0

    login(world.other_teacher)
    assert client.get("/api/workplaces").json() == []
    assert client.get("/api/notifications").json()["unread"] == 0


def test_teacher_can_place_student_at_invited_company(
    client: TestClient, login: Login, world: World, mail: MagicMock, db: Session
) -> None:
    login(world.teacher)
    token = invite(client, mail)
    client.post("/api/auth/logout")
    supervisor_id = accept(client, token).json()["id"]
    workplace = db.scalar(select(Workplace))
    login(world.teacher)
    response = client.post(
        "/api/placements",
        json={
            "student_id": str(world.student.id),
            "workplace_id": str(workplace.id),
            "supervisor_id": supervisor_id,
            "start_date": "2026-11-02",
            "end_date": "2026-12-11",
        },
    )
    assert response.status_code == 201


def test_accept_requires_company(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    login(world.teacher)
    token = invite(client, mail)
    client.post("/api/auth/logout")
    response = accept(client, token, company=None)
    assert response.status_code == 422
    assert response.json()["detail"] == "Fyll i uppgifterna om företaget"


def test_password_must_be_long(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    login(world.teacher)
    token = invite(client, mail)
    client.post("/api/auth/logout")
    assert accept(client, token, password="kort").status_code == 422


def test_expired_link(client: TestClient, login: Login, world: World, mail: MagicMock) -> None:
    login(world.teacher)
    token = invite(client, mail)
    later = time.now() + timedelta(days=15)
    with patch("app.core.time.now", return_value=later):
        assert client.get(f"/api/invite/{token}").status_code == 404
        assert accept(client, token).status_code == 404
        assert client.get("/api/invitations").json()[0]["status"] == "expired"


def test_admin_invited_company_is_shared(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    login(world.admin)
    token = invite(client, mail)
    client.post("/api/auth/logout")
    assert accept(client, token).status_code == 200
    for teacher in (world.teacher, world.other_teacher):
        login(teacher)
        assert [w["name"] for w in client.get("/api/workplaces").json()] == ["Elbolaget AB"]
    login(world.umea_teacher)
    assert client.get("/api/workplaces").json() == []


# --- Delad företagsprofil (Texas, 2026-11-02) ----------------------------------------------


def test_second_school_joins_existing_company(
    client: TestClient, login: Login, world: World, mail: MagicMock, db: Session
) -> None:
    """En handledare har ett företag. En ny skola läggs till utan att något fylls i igen."""
    workplace_id = setup_supervisor(client, login, world, mail)

    login(world.umea_teacher)
    token = invite(client, mail)
    client.post("/api/auth/logout")
    preview = client.get(f"/api/invite/{token}").json()
    assert preview["existing_workplace_name"] == "Elbolaget AB"
    assert preview["has_account"] is True

    # Inget namn, lösenord eller företag behövs. Sidan skickar null.
    body = {"name": None, "password": None, "company": None}
    response = client.post(f"/api/invite/{token}/accept", json=body)
    assert response.status_code == 200, response.text
    company = client.get("/api/supervisor/workplaces").json()
    assert [(w["id"], w["school_names"]) for w in company] == [
        (workplace_id, ["Kramforsskolan", "Umeåskolan"])
    ]
    # Lösenordet är kvar.
    client.post("/api/auth/logout")
    login_body = {"email": "gustav@elbolaget.se", "password": "ett-langt-losenord"}
    assert client.post("/api/auth/login", json=login_body).status_code == 200

    # Båda skolornas lärare ser företaget, och läraren på Umeåskolan får en notis.
    login(world.umea_teacher)
    assert [w["id"] for w in client.get("/api/workplaces").json()] == [workplace_id]
    notes = client.get("/api/notifications").json()["items"]
    assert "Elbolaget AB finns nu bland era praktikplatser" in notes[0]["text"]
    login(world.teacher)
    assert [w["id"] for w in client.get("/api/workplaces").json()] == [workplace_id]
    assert db.scalar(select(Workplace.id).where(Workplace.name == "Elbolaget AB")) is not None


def test_same_school_cannot_invite_twice(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    setup_supervisor(client, login, world, mail)
    login(world.other_teacher)
    response = client.post("/api/invitations", json={"email": "gustav@elbolaget.se"})
    assert response.status_code == 409
    assert "tar redan emot elever från er skola" in response.json()["detail"]


def test_colleague_with_other_company_cannot_join(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    """En handledare med ett eget företag kan inte bjudas in som kollega på ett annat."""
    setup_supervisor(client, login, world, mail)
    login(world.umea_teacher)
    token = invite(client, mail, "lisa@bygg.se")
    client.post("/api/auth/logout")
    assert accept(client, token, name="Lisa Berg").status_code == 200
    # Lisa har nu ett eget företag och ett konto. Gustav kan inte bjuda in henne.
    login(world.teacher)
    client.post("/api/auth/logout")
    gustav = {"email": "gustav@elbolaget.se", "password": "ett-langt-losenord"}
    client.post("/api/auth/login", json=gustav)
    workplace_id = client.get("/api/supervisor/workplaces").json()[0]["id"]
    response = client.post(
        f"/api/supervisor/workplaces/{workplace_id}/invitations", json={"email": "lisa@bygg.se"}
    )
    assert response.status_code == 409


# --- Kollegor ------------------------------------------------------------------------------


def setup_supervisor(client: TestClient, login: Login, world: World, mail: MagicMock) -> str:
    """Läraren bjuder in, handledaren tackar ja. Returnerar arbetsplatsens id, inloggad som
    handledaren."""
    login(world.teacher)
    token = invite(client, mail)
    client.post("/api/auth/logout")
    assert accept(client, token).status_code == 200
    return client.get("/api/supervisor/workplaces").json()[0]["id"]


def test_supervisor_invites_colleague(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    workplace_id = setup_supervisor(client, login, world, mail)
    response = client.post(
        f"/api/supervisor/workplaces/{workplace_id}/invitations",
        json={"email": "anna@elbolaget.se"},
    )
    assert response.status_code == 201
    assert [i["email"] for i in response.json()["pending_invitations"]] == ["anna@elbolaget.se"]
    token = token_from(mail)
    assert "Elbolaget AB" in mail.call_args.args[2]

    client.post("/api/auth/logout")
    assert client.get(f"/api/invite/{token}").json()["workplace_name"] == "Elbolaget AB"
    response = accept(client, token, company=None, name="Anna Ek")
    assert response.status_code == 200
    names = [s["name"] for s in client.get("/api/supervisor/workplaces").json()[0]["supervisors"]]
    assert sorted(names) == ["Anna Ek", "Gustav Lindahl"]

    login(world.teacher)
    assert "Anna Ek" in client.get("/api/notifications").json()["items"][0]["text"]


def test_at_most_three_colleagues(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    workplace_id = setup_supervisor(client, login, world, mail)
    url = f"/api/supervisor/workplaces/{workplace_id}/invitations"
    for i in range(3):
        assert client.post(url, json={"email": f"kollega{i}@elbolaget.se"}).status_code == 201
    fourth = client.post(url, json={"email": "kollega3@elbolaget.se"})
    assert fourth.status_code == 409
    assert fourth.json()["detail"] == "Du kan bjuda in högst 3 kollegor"
    assert client.get("/api/supervisor/workplaces").json()[0]["can_invite"] is False
    # En ny inbjudan till samma person räknas inte dubbelt.
    assert client.post(url, json={"email": "kollega0@elbolaget.se"}).status_code == 201


def test_supervisor_edits_profile(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    workplace_id = setup_supervisor(client, login, world, mail)
    response = client.put(
        f"/api/supervisor/workplaces/{workplace_id}",
        json={"name": "Elbolaget i Kramfors", "address": "", "industry": "El och data"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Elbolaget i Kramfors"
    assert response.json()["address"] is None
    assert response.json()["industry"] == "El och data"


def test_supervisor_cannot_touch_other_workplace(
    client: TestClient,
    login: Login,
    world: World,
    mail: MagicMock,
    make_user: MakeUser,
    db: Session,
) -> None:
    workplace_id = setup_supervisor(client, login, world, mail)
    login(make_user(email="lisa@bygg.se", role=UserRole.SUPERVISOR))
    assert client.get("/api/supervisor/workplaces").json() == []
    url = f"/api/supervisor/workplaces/{workplace_id}"
    assert client.put(url, json={"name": "X"}).status_code == 404
    assert client.post(f"{url}/invitations", json={"email": "a@b.se"}).status_code == 404


def test_teacher_cannot_use_supervisor_workplaces(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.teacher)
    assert client.get("/api/supervisor/workplaces").status_code == 403


def test_notifications_require_login(client: TestClient) -> None:
    assert client.get("/api/notifications").status_code == 401


# --- Logga (Texas, 2026-11-02) ---------------------------------------------------------------

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def upload(client: TestClient, workplace_id: str, data: bytes, name: str = "logga.png"):  # noqa: ANN201
    files = {"file": (name, data, "application/octet-stream")}
    return client.put(f"/api/supervisor/workplaces/{workplace_id}/logo", files=files)


def test_supervisor_uploads_logo(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    workplace_id = setup_supervisor(client, login, world, mail)
    response = upload(client, workplace_id, PNG)
    assert response.status_code == 200, response.text
    url = response.json()["logo_url"]
    assert url.startswith(f"/api/workplaces/{workplace_id}/logo?v=")

    logo = client.get(url)
    assert logo.status_code == 200
    assert logo.content == PNG
    assert logo.headers["content-type"] == "image/png"

    # Lärare och elever på skolan ser loggan, och den finns i listan över praktikplatser.
    login(world.teacher)
    assert client.get(url).status_code == 200
    assert client.get("/api/workplaces").json()[0]["logo_url"] == url
    login(world.student)
    assert client.get(url).status_code == 200
    # En annan skola utan elever där ser den inte.
    login(world.umea_teacher)
    assert client.get(url).status_code == 404


def test_logo_must_be_small_image(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    workplace_id = setup_supervisor(client, login, world, mail)
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    assert upload(client, workplace_id, svg, "logga.svg").status_code == 422
    assert upload(client, workplace_id, b"%PDF-1.7").status_code == 422
    big = PNG + b"\x00" * (1024 * 1024)
    assert upload(client, workplace_id, big).status_code == 413
    jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 16
    assert upload(client, workplace_id, jpeg, "logga.jpg").json()["logo_url"] is not None
    webp = b"RIFF\x10\x00\x00\x00WEBPVP8 " + b"\x00" * 16
    response = upload(client, workplace_id, webp, "logga.webp")
    assert client.get(response.json()["logo_url"]).headers["content-type"] == "image/webp"


def test_supervisor_removes_logo(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    workplace_id = setup_supervisor(client, login, world, mail)
    url = upload(client, workplace_id, PNG).json()["logo_url"]
    response = client.delete(f"/api/supervisor/workplaces/{workplace_id}/logo")
    assert response.status_code == 200
    assert response.json()["logo_url"] is None
    assert client.get(url).status_code == 404


def test_only_own_supervisor_uploads_logo(
    client: TestClient, login: Login, world: World, mail: MagicMock
) -> None:
    workplace_id = setup_supervisor(client, login, world, mail)
    login(world.teacher)
    assert upload(client, workplace_id, PNG).status_code == 403
