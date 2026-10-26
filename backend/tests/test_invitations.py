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
    assert [(w["name"], w["industry"], w["school_name"]) for w in company] == [
        ("Elbolaget AB", "El", "Kramforsskolan")
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
