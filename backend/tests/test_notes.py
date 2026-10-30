"""Anteckningar om eleven (B18, Texas 2026-10-30): handledaren skriver, läraren läser."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core import time
from app.models.note import StudentNote
from app.models.placement import Placement, Workplace
from app.models.school import School
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]


@dataclass
class World:
    teacher: User
    other_teacher: User
    admin: User
    hugo: User
    gustav: User
    sofia: User


@pytest.fixture
def w(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> World:
    school = make_school("Kramforsskolan")
    teacher = make_user(email="ingrid@kramfors.se", in_school=school)
    other = make_user(email="per@kramfors.se", in_school=school)
    admin = make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=school)
    hugo = make_user(email="hugo@kramfors.se", role=UserRole.STUDENT, in_school=school)
    gustav = make_user(email="gustav@kramforsel.se", role=UserRole.SUPERVISOR, in_school=None)
    sofia = make_user(email="sofia@hogakusten.se", role=UserRole.SUPERVISOR, in_school=None)
    ee22 = SchoolClass(school_id=school.id, name="EE22", teachers=[teacher], students=[hugo])
    kramfors = Workplace(school_id=school.id, name="Kramfors El", supervisors=[gustav])
    hoga = Workplace(school_id=school.id, name="Höga Kusten El", supervisors=[sofia])
    db.add_all([ee22, kramfors, hoga])
    db.flush()
    today = time.today()
    # Hugo var hos Sofia tidigare och är hos Gustav nu.
    db.add_all(
        [
            Placement(
                student_id=hugo.id,
                workplace_id=hoga.id,
                supervisor_id=sofia.id,
                start_date=today - timedelta(days=60),
                end_date=today - timedelta(days=31),
            ),
            Placement(
                student_id=hugo.id,
                workplace_id=kramfors.id,
                supervisor_id=gustav.id,
                start_date=today - timedelta(days=30),
                end_date=today + timedelta(days=30),
            ),
        ]
    )
    db.flush()
    return World(teacher, other, admin, hugo, gustav, sofia)


def url(w: World) -> str:
    return f"/api/students/{w.hugo.id}/notes"


def test_supervisor_writes_and_teacher_reads(client: TestClient, login: Login, w: World) -> None:
    login(w.gustav)
    response = client.post(url(w), json={"tag": "praise", "body": "  Bra på kundkontakt.  "})
    assert response.status_code == 201, response.text
    note = response.json()
    assert note["body"] == "Bra på kundkontakt."
    assert note["can_edit"] is True
    client.post(url(w), json={"tag": "concern", "body": "Höjde rösten mot en kollega."})
    assert [n["tag"] for n in client.get(url(w)).json()] == ["concern", "praise"]

    login(w.teacher)
    notes = client.get(url(w)).json()
    assert [n["author"]["id"] for n in notes] == [str(w.gustav.id)] * 2
    assert notes[0]["can_edit"] is False
    # Läraren skriver inga anteckningar.
    assert client.post(url(w), json={"tag": "other", "body": "Hej"}).status_code == 403


def test_only_teacher_and_current_supervisor(
    client: TestClient, db: Session, login: Login, w: World
) -> None:
    db.add(StudentNote(student_id=w.hugo.id, author_id=w.sofia.id, tag="other", body="Gammal"))
    db.flush()

    # Sofia har inte Hugo längre och får 404, och Gustav ser inte Sofias anteckning.
    login(w.sofia)
    assert client.get(url(w)).status_code == 404
    assert client.post(url(w), json={"tag": "other", "body": "Hej"}).status_code == 404
    login(w.gustav)
    assert client.get(url(w)).json() == []

    # Läraren ser den. En lärare utan koppling, skoladmin och eleven ser den inte.
    login(w.teacher)
    assert [n["body"] for n in client.get(url(w)).json()] == ["Gammal"]
    login(w.other_teacher)
    assert client.get(url(w)).status_code == 404
    login(w.admin)
    assert client.get(url(w)).status_code == 403
    login(w.hugo)
    assert client.get(url(w)).status_code == 403


def test_edit_and_delete_within_24_hours(
    client: TestClient, db: Session, login: Login, w: World
) -> None:
    login(w.gustav)
    note_id = client.post(url(w), json={"tag": "other", "body": "Först"}).json()["id"]
    response = client.put(f"{url(w)}/{note_id}", json={"tag": "praise", "body": "Ändrad"})
    assert response.status_code == 200
    assert response.json()["tag"] == "praise" and response.json()["updated_at"] is not None

    old = db.get(StudentNote, note_id)
    assert old is not None
    old.created_at = time.now() - timedelta(hours=25)
    db.flush()
    assert client.get(url(w)).json()[0]["can_edit"] is False
    response = client.put(f"{url(w)}/{note_id}", json={"tag": "other", "body": "Sent"})
    assert response.status_code == 409
    assert client.delete(f"{url(w)}/{note_id}").status_code == 409

    fresh = client.post(url(w), json={"tag": "other", "body": "Ny"}).json()["id"]
    assert client.delete(f"{url(w)}/{fresh}").status_code == 204
    assert len(client.get(url(w)).json()) == 1
