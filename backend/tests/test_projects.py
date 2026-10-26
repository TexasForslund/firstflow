"""Projekt (B12): läraren skapar projekt, kopplar elever, och redovisningar visar projektet."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.report import FormVersion, Report, ReportStatus
from app.models.school import School
from app.models.school_class import SchoolClass, teacher_students
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]


@dataclass
class World:
    teacher: User
    other_teacher: User
    admin: User
    hugo: User
    maja: User
    stranger: User
    ee22: SchoolClass


@pytest.fixture
def w(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> World:
    school = make_school("Kramforsskolan")
    teacher = make_user(email="ingrid@kramfors.se", in_school=school)
    other = make_user(email="per@kramfors.se", in_school=school)
    admin = make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=school)
    hugo = make_user(email="hugo@kramfors.se", role=UserRole.STUDENT, in_school=school)
    maja = make_user(email="maja@kramfors.se", role=UserRole.STUDENT, in_school=school)
    # En elev på skolan som inte är kopplad till läraren.
    stranger = make_user(email="sara@kramfors.se", role=UserRole.STUDENT, in_school=school)
    ee22 = SchoolClass(school_id=school.id, name="EE22", teachers=[teacher], students=[hugo, maja])
    db.add(ee22)
    db.flush()
    db.execute(teacher_students.insert().values(teacher_id=teacher.id, student_id=hugo.id))
    return World(teacher, other, admin, hugo, maja, stranger, ee22)


def body(w: World, **extra: object) -> dict[str, object]:
    return {
        "name": "Elinstallation i villa",
        "description": "  Dra kabel och koppla in belysning.  ",
        "deadline": "2026-12-04",
        "tags": ["Elinstallation", " Mätning ", "elinstallation"],
        "student_ids": [str(w.hugo.id), str(w.maja.id)],
        **extra,
    }


def test_create_and_list_projects(client: TestClient, login: Login, w: World) -> None:
    login(w.teacher)
    response = client.post("/api/projects", json=body(w))
    assert response.status_code == 201
    project = response.json()
    assert project["description"] == "Dra kabel och koppla in belysning."
    assert project["tags"] == ["Elinstallation", "Mätning"]
    assert {s["id"] for s in project["students"]} == {str(w.hugo.id), str(w.maja.id)}
    assert project["is_owner"] is True
    assert [p["name"] for p in client.get("/api/projects").json()] == ["Elinstallation i villa"]

    login(w.other_teacher)
    assert client.get("/api/projects").json() == []


def test_cannot_add_students_the_teacher_cannot_see(
    client: TestClient, login: Login, w: World
) -> None:
    login(w.teacher)
    response = client.post("/api/projects", json=body(w, student_ids=[str(w.stranger.id)]))
    assert response.status_code == 404


def test_update_and_delete_own_project_only(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    login(w.teacher)
    project_id = client.post("/api/projects", json=body(w)).json()["id"]

    login(w.other_teacher)
    assert (
        client.put(f"/api/projects/{project_id}", json=body(w, student_ids=[])).status_code == 404
    )
    assert client.delete(f"/api/projects/{project_id}").status_code == 404

    login(w.teacher)
    updated = client.put(
        f"/api/projects/{project_id}", json=body(w, name="Ny", student_ids=[str(w.hugo.id)])
    ).json()
    assert (updated["name"], [s["name"] for s in updated["students"]]) == ("Ny", ["Testperson"])
    assert client.delete(f"/api/projects/{project_id}").status_code == 204
    assert db.get(Project, project_id) is None


def test_student_projects_and_counts(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    login(w.teacher)
    project_id = client.post("/api/projects", json=body(w)).json()["id"]
    version = FormVersion(class_id=w.ee22.id, version=1, questions=[])
    db.add(version)
    db.flush()
    db.add(
        Report(
            class_id=w.ee22.id,
            student_id=w.hugo.id,
            form_version_id=version.id,
            due_date=date(2026, 10, 16),
            status=ReportStatus.SUBMITTED,
            submitted_at=datetime(2026, 10, 16, 14, 0, tzinfo=UTC),
            project_id=project_id,
        )
    )
    db.flush()

    projects = client.get(f"/api/students/{w.hugo.id}/projects").json()
    assert [(p["name"], p["report_count"]) for p in projects] == [("Elinstallation i villa", 1)]
    assert client.get(f"/api/students/{w.hugo.id}").json()["project_count"] == 1
    reports = client.get(f"/api/students/{w.hugo.id}/reports").json()
    assert reports[0]["project"] == {"id": project_id, "name": "Elinstallation i villa"}

    login(w.admin)
    assert client.get(f"/api/students/{w.hugo.id}/projects").status_code == 200
    login(w.other_teacher)
    assert client.get(f"/api/students/{w.hugo.id}/projects").status_code == 404


@pytest.mark.parametrize("role", [UserRole.STUDENT, UserRole.SCHOOL_ADMIN, UserRole.SUPERVISOR])
def test_only_teachers_manage_projects(
    client: TestClient, login: Login, make_user: MakeUser, role: UserRole
) -> None:
    login(make_user(email=f"{role.value}@kramfors.se", role=role))
    assert client.get("/api/projects").status_code == 403
    assert client.post("/api/projects", json={"name": "X"}).status_code == 403
