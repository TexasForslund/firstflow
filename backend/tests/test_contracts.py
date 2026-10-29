"""Kontrakt (B8): läraren laddar upp en PDF, skickar den, och elev, handledare och lärare
signerar i testläge (Texas, 2026-10-29)."""

from collections.abc import Callable
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.invitation import Notification
from app.models.placement import Workplace
from app.models.school import School
from app.models.school_class import SchoolClass, teacher_students
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]
PDF = b"%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n"


@dataclass
class World:
    teacher: User
    other_teacher: User
    hugo: User
    stranger: User
    gustav: User
    sofia: User
    workplace: Workplace
    other_workplace: Workplace


@pytest.fixture
def w(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> World:
    school = make_school("Kramforsskolan")
    teacher = make_user(email="ingrid@kramfors.se", in_school=school)
    teacher.name = "Ingrid Svensson"
    other = make_user(email="per@kramfors.se", in_school=school)
    hugo = make_user(email="hugo@kramfors.se", role=UserRole.STUDENT, in_school=school)
    hugo.name = "Hugo Karlsson"
    stranger = make_user(email="sara@kramfors.se", role=UserRole.STUDENT, in_school=school)
    gustav = make_user(email="gustav@eldata.se", role=UserRole.SUPERVISOR)
    sofia = make_user(email="sofia@hogakusten.se", role=UserRole.SUPERVISOR)
    workplace = Workplace(school_id=school.id, name="Kramfors El & Data", supervisors=[gustav])
    # Ett företag som en annan lärare har bjudit in.
    other_wp = Workplace(
        school_id=school.id,
        name="Höga Kusten El",
        owner_teacher_id=other.id,
        supervisors=[sofia],
    )
    el23 = SchoolClass(school_id=school.id, name="EL23", teachers=[teacher], students=[hugo])
    db.add_all([workplace, other_wp, el23])
    db.flush()
    db.execute(teacher_students.insert().values(teacher_id=teacher.id, student_id=hugo.id))
    return World(teacher, other, hugo, stranger, gustav, sofia, workplace, other_wp)


def form(w: World, **extra: object) -> dict[str, object]:
    return {
        "title": "Utbildningskontrakt APL – Hugo",
        "student_id": str(w.hugo.id),
        "workplace_id": str(w.workplace.id),
        "supervisor_id": str(w.gustav.id),
        "start_date": "2026-08-03",
        "end_date": "2026-11-27",
        **extra,
    }


def create(client: TestClient, w: World, *, send: bool = True, pdf: bytes = PDF, **extra: object):
    return client.post(
        "/api/contracts",
        data={**form(w, **extra), "send": str(send).lower()},
        files={"file": ("Kontrakt Hugo.pdf", pdf, "application/pdf")},
    )


def notes(db: Session, user: User) -> list[Notification]:
    return list(db.scalars(select(Notification).where(Notification.user_id == user.id)))


def test_draft_then_send(client: TestClient, db: Session, login: Login, w: World) -> None:
    login(w.teacher)
    response = create(client, w, send=False)
    assert response.status_code == 201, response.text
    draft = response.json()
    assert draft["status"] == "draft"
    assert [s["role"] for s in draft["signers"]] == ["student", "supervisor", "teacher"]
    assert draft["file_name"] == "Kontrakt Hugo.pdf"
    assert draft["student"]["email"] == "hugo@kramfors.se"
    # Ett utkast syns inte för eleven och ingen notis går ut.
    assert notes(db, w.hugo) == []
    login(w.hugo)
    assert client.get("/api/contracts").json() == []
    assert client.get(f"/api/contracts/{draft['id']}").status_code == 404

    login(w.teacher)
    sent = client.post(f"/api/contracts/{draft['id']}/send").json()
    assert sent["status"] == "waiting"
    teacher_sig = sent["signers"][2]
    assert teacher_sig["signed_at"] is not None
    assert len(notes(db, w.hugo)) == 1 and len(notes(db, w.gustav)) == 1
    assert client.post(f"/api/contracts/{draft['id']}/send").status_code == 409


def test_parties_sign_and_teacher_is_notified(
    client: TestClient, db: Session, login: Login, w: World
) -> None:
    login(w.teacher)
    contract_id = create(client, w).json()["id"]

    login(w.hugo)
    mine = client.get("/api/contracts").json()
    assert [c["id"] for c in mine] == [contract_id]
    assert mine[0]["my_role"] == "student" and mine[0]["my_turn"] is True
    pdf = client.get(f"/api/contracts/{contract_id}/pdf")
    assert pdf.status_code == 200 and pdf.content == PDF
    assert pdf.headers["content-type"] == "application/pdf"
    opened = client.get(f"/api/contracts/{contract_id}").json()["signers"][0]
    assert opened["opened_at"] is not None and opened["signed_at"] is None
    assert (
        client.post(f"/api/contracts/{contract_id}/sign", json={"confirm": False}).status_code
        == 422
    )
    signed = client.post(f"/api/contracts/{contract_id}/sign", json={"confirm": True}).json()
    assert signed["status"] == "waiting" and signed["my_turn"] is False
    assert (
        client.post(f"/api/contracts/{contract_id}/sign", json={"confirm": True}).status_code == 409
    )
    assert notes(db, w.teacher) == []

    login(w.gustav)
    done = client.post(f"/api/contracts/{contract_id}/sign", json={"confirm": True}).json()
    assert done["status"] == "signed"
    assert [n.link for n in notes(db, w.teacher)] == [f"/contracts/{contract_id}"]

    # Signerat kontrakt kan inte tas bort.
    login(w.teacher)
    assert client.delete(f"/api/contracts/{contract_id}").status_code == 409


def test_only_parties_see_the_contract(client: TestClient, login: Login, w: World) -> None:
    login(w.teacher)
    contract_id = create(client, w).json()["id"]
    for outsider in (w.other_teacher, w.stranger, w.sofia):
        login(outsider)
        assert client.get(f"/api/contracts/{contract_id}").status_code == 404
        assert client.get(f"/api/contracts/{contract_id}/pdf").status_code == 404
        assert client.get("/api/contracts").json() == []
    # Bara läraren påminner och skickar.
    login(w.gustav)
    assert client.post(f"/api/contracts/{contract_id}/remind").status_code == 403


def test_create_validates_parties_and_file(client: TestClient, login: Login, w: World) -> None:
    login(w.teacher)
    # Eleven måste vara en elev läraren får se.
    assert create(client, w, student_id=str(w.stranger.id)).status_code == 404
    # Företaget måste vara ett läraren får se.
    other = create(client, w, workplace_id=str(w.other_workplace.id), supervisor_id=str(w.sofia.id))
    assert other.status_code == 404
    # Handledaren måste höra till företaget.
    assert create(client, w, supervisor_id=str(w.sofia.id)).status_code == 422
    assert create(client, w, pdf=b"inte en pdf").status_code == 422
    assert create(client, w, end_date="2026-07-01").status_code == 422


def test_remind_and_delete(client: TestClient, db: Session, login: Login, w: World) -> None:
    login(w.teacher)
    contract_id = create(client, w).json()["id"]
    assert client.post(f"/api/contracts/{contract_id}/remind").json() == {"reminded": 2}
    assert len(notes(db, w.hugo)) == 2
    assert client.delete(f"/api/contracts/{contract_id}").status_code == 204
    assert client.get("/api/contracts").json() == []


@pytest.mark.parametrize("role", [UserRole.SCHOOL_ADMIN, UserRole.PRINCIPAL])
def test_other_roles_have_no_access_yet(
    client: TestClient, login: Login, make_user: MakeUser, role: UserRole
) -> None:
    login(make_user(email=f"{role.value}@kramfors.se", role=role))
    assert client.get("/api/contracts").status_code == 403
