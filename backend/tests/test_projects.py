"""Projekt (B12): läraren skapar projekt, kopplar elever, och redovisningar visar projektet."""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.invitation import Notification
from app.models.placement import Workplace
from app.models.project import Project
from app.models.report import FormVersion, Report, ReportAnswer, ReportRead, ReportStatus
from app.models.school import School
from app.models.school_class import SchoolClass, teacher_students
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
QUESTION = uuid.UUID("00000000-0000-4000-8000-000000000001")
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


@pytest.mark.parametrize("role", [UserRole.STUDENT, UserRole.SCHOOL_ADMIN])
def test_only_teachers_manage_projects(
    client: TestClient, login: Login, make_user: MakeUser, role: UserRole
) -> None:
    login(make_user(email=f"{role.value}@kramfors.se", role=role))
    assert client.get("/api/projects").status_code == 403
    assert client.post("/api/projects", json={"name": "X"}).status_code == 403


# --- Företag och handledare (Texas, 2026-10-29) --------------------------------------------


@dataclass
class Company:
    workplace: Workplace
    sofia: User
    gustav: User
    other_workplace: Workplace
    outsider: User


@pytest.fixture
def company(db: Session, w: World, make_user: MakeUser) -> Company:
    sofia = make_user(email="sofia@hogakusten.se", role=UserRole.SUPERVISOR, in_school=None)
    sofia.name = "Sofia Åberg"
    gustav = make_user(email="gustav@hogakusten.se", role=UserRole.SUPERVISOR, in_school=None)
    outsider = make_user(email="olle@annat.se", role=UserRole.SUPERVISOR, in_school=None)
    workplace = Workplace(
        school_id=w.ee22.school_id, name="Höga Kusten El", supervisors=[sofia, gustav]
    )
    # Ett företag som en annan lärare har bjudit in. Läraren får inte välja det.
    other = Workplace(
        school_id=w.ee22.school_id,
        name="Pers företag",
        owner_teacher_id=w.other_teacher.id,
        supervisors=[outsider],
    )
    db.add_all([workplace, other])
    db.flush()
    return Company(workplace, sofia, gustav, other, outsider)


def with_company(w: World, c: Company, **extra: object) -> dict[str, object]:
    fields: dict[str, object] = {
        "workplace_id": str(c.workplace.id),
        "supervisor_ids": [str(c.sofia.id)],
        **extra,
    }
    return body(w, **fields)


def test_teacher_adds_company_and_supervisor(
    client: TestClient, db: Session, login: Login, w: World, company: Company
) -> None:
    login(w.teacher)
    response = client.post("/api/projects", json=with_company(w, company))
    assert response.status_code == 201, response.text
    project = response.json()
    assert project["workplace"]["name"] == "Höga Kusten El"
    assert [s["name"] for s in project["supervisors"]] == ["Sofia Åberg"]
    assert project["can_edit_students"] is True
    # Sofia får en notis med länk till projektet.
    note = db.scalar(select(Notification).where(Notification.user_id == company.sofia.id))
    assert note is not None and note.link == f"/projects/{project['id']}"

    # Handledare måste höra till projektets företag.
    bad = with_company(w, company, supervisor_ids=[str(company.outsider.id)])
    assert client.post("/api/projects", json=bad).status_code == 422
    # Företaget måste vara ett läraren får se.
    other = body(w, workplace_id=str(company.other_workplace.id))
    assert client.post("/api/projects", json=other).status_code == 404


def test_supervisor_edits_text_but_not_students(
    client: TestClient, login: Login, w: World, company: Company
) -> None:
    login(w.teacher)
    project_id = client.post("/api/projects", json=with_company(w, company)).json()["id"]

    login(company.sofia)
    listed = client.get("/api/projects").json()
    assert [p["id"] for p in listed] == [project_id]
    assert listed[0]["can_edit_students"] is False
    assert client.get(f"/api/projects/{project_id}").status_code == 200

    text = {"name": "Laddbox", "description": "Ny text", "deadline": None, "tags": ["Ladd"]}
    response = client.put(f"/api/projects/{project_id}", json=text)
    assert response.status_code == 200, response.text
    assert response.json()["description"] == "Ny text"
    assert len(response.json()["students"]) == 2

    for field, value in [
        ("student_ids", []),
        ("supervisor_ids", []),
        ("workplace_id", str(company.workplace.id)),
        ("completed", True),
    ]:
        sent = client.put(f"/api/projects/{project_id}", json={**text, field: value})
        assert sent.status_code == 403, field
    assert client.delete(f"/api/projects/{project_id}").status_code == 403
    assert client.post("/api/projects", json=text).status_code == 403

    # En handledare som inte är inbjuden ser inte projektet.
    login(company.gustav)
    assert client.get("/api/projects").json() == []
    assert client.get(f"/api/projects/{project_id}").status_code == 404
    assert client.put(f"/api/projects/{project_id}", json=text).status_code == 404


def test_changing_company_drops_its_supervisors(
    client: TestClient, db: Session, login: Login, w: World, company: Company
) -> None:
    login(w.teacher)
    project_id = client.post("/api/projects", json=with_company(w, company)).json()["id"]
    own = Workplace(school_id=w.ee22.school_id, name="Kramfors El", owner_teacher_id=w.teacher.id)
    db.add(own)
    db.flush()
    response = client.put(f"/api/projects/{project_id}", json=body(w, workplace_id=str(own.id)))
    assert response.json()["workplace"]["name"] == "Kramfors El"
    assert response.json()["supervisors"] == []

    response = client.put(f"/api/projects/{project_id}", json=body(w, clear_workplace=True))
    assert response.json()["workplace"] is None


def test_complete_and_reopen(client: TestClient, login: Login, w: World) -> None:
    login(w.teacher)
    project_id = client.post("/api/projects", json=body(w)).json()["id"]
    done = client.put(f"/api/projects/{project_id}", json=body(w, completed=True)).json()
    assert done["completed_at"] is not None
    # Utan `completed` ändras inte statusen.
    assert client.put(f"/api/projects/{project_id}", json=body(w)).json()["completed_at"]
    again = client.put(f"/api/projects/{project_id}", json=body(w, completed=False)).json()
    assert again["completed_at"] is None


def test_project_reports(
    client: TestClient, db: Session, login: Login, w: World, company: Company
) -> None:
    login(w.teacher)
    project_id = client.post("/api/projects", json=with_company(w, company)).json()["id"]
    form = FormVersion(
        class_id=w.ee22.id,
        version=1,
        questions=[
            {"id": str(QUESTION), "type": "long_text", "title": "Vad har du gjort?"},
        ],
    )
    db.add(form)
    db.flush()
    reports = []
    for day, student in [(6, w.hugo), (13, w.maja)]:
        report = Report(
            class_id=w.ee22.id,
            student_id=student.id,
            form_version_id=form.id,
            due_date=date(2026, 10, day),
            project_id=project_id,
            status=ReportStatus.SUBMITTED,
            submitted_at=datetime(2026, 10, day, 15, tzinfo=UTC),
        )
        db.add(report)
        db.flush()
        db.add(ReportAnswer(report_id=report.id, question_id=QUESTION, text=f"Svar {day}"))
        reports.append(report)
    # En utkast räknas inte.
    db.add(
        Report(
            class_id=w.ee22.id,
            student_id=w.hugo.id,
            form_version_id=form.id,
            due_date=date(2026, 10, 20),
            project_id=project_id,
        )
    )
    db.add(ReportRead(report_id=reports[0].id, user_id=w.teacher.id))
    db.flush()

    rows = client.get(f"/api/projects/{project_id}/reports").json()
    assert [r["student"]["name"] for r in rows] == [w.maja.name, w.hugo.name]
    assert [r["is_read"] for r in rows] == [False, True]
    assert rows[0]["answers"][0]["text"] == "Svar 13"
    assert client.get(f"/api/projects/{project_id}").json()["unread_count"] == 1
    only = client.get(f"/api/projects/{project_id}/reports?student_id={w.hugo.id}").json()
    assert [r["id"] for r in only] == [str(reports[0].id)]

    login(company.sofia)
    rows = client.get(f"/api/projects/{project_id}/reports").json()
    assert len(rows) == 2 and rows[0]["is_read"] is None
    login(company.gustav)
    assert client.get(f"/api/projects/{project_id}/reports").status_code == 404


# --- Eleven kopplar en redovisning till ett projekt (Texas, 2026-10-29) ----------------------


def test_student_links_report_to_project(
    client: TestClient, db: Session, login: Login, w: World
) -> None:
    login(w.teacher)
    project_id = client.post("/api/projects", json=body(w)).json()["id"]
    other_id = client.post(
        "/api/projects", json=body(w, name="Annat", student_ids=[str(w.maja.id)])
    ).json()["id"]
    done = client.post(
        "/api/projects", json=body(w, name="Klart", student_ids=[str(w.hugo.id)])
    ).json()["id"]
    client.put(f"/api/projects/{done}", json=body(w, name="Klart", completed=True))

    version = FormVersion(class_id=w.ee22.id, version=1, questions=[])
    db.add(version)
    db.flush()
    report = Report(
        class_id=w.ee22.id,
        student_id=w.hugo.id,
        form_version_id=version.id,
        due_date=date(2026, 10, 27),
    )
    db.add(report)
    db.flush()

    login(w.hugo)
    # Avslutade projekt och andras projekt syns inte.
    assert [p["id"] for p in client.get("/api/me/projects").json()] == [project_id]

    url = f"/api/reports/{report.id}/project"
    linked = client.put(url, json={"project_id": project_id})
    assert linked.status_code == 200, linked.text
    assert linked.json()["project"]["id"] == project_id
    assert client.put(url, json={"project_id": other_id}).status_code == 404
    assert client.put(url, json={"project_id": None}).json()["project"] is None

    # Efter inskick går det inte att ändra.
    report.status = ReportStatus.SUBMITTED
    report.submitted_at = datetime(2026, 10, 27, 15, tzinfo=UTC)
    db.flush()
    assert client.put(url, json={"project_id": project_id}).status_code == 409

    # Bara eleven själv.
    login(w.teacher)
    assert client.put(url, json={"project_id": None}).status_code == 403
    assert client.get("/api/me/projects").status_code == 403


# --- Eleven öppnar ett projekt från Min APL (Texas, 2026-10-29) -----------------------------


def test_student_opens_own_project(client: TestClient, db: Session, login: Login, w: World) -> None:
    login(w.teacher)
    project_id = client.post("/api/projects", json=body(w)).json()["id"]
    form = FormVersion(
        class_id=w.ee22.id,
        version=1,
        questions=[{"id": str(QUESTION), "type": "long_text", "title": "Vad har du gjort?"}],
    )
    db.add(form)
    db.flush()
    for day, student in [(6, w.hugo), (9, w.hugo), (13, w.maja)]:
        report = Report(
            class_id=w.ee22.id,
            student_id=student.id,
            form_version_id=form.id,
            due_date=date(2026, 10, day),
            project_id=project_id,
            status=ReportStatus.SUBMITTED,
            submitted_at=datetime(2026, 10, day, 15, tzinfo=UTC),
        )
        db.add(report)
        db.flush()
        db.add(ReportAnswer(report_id=report.id, question_id=QUESTION, text=f"Svar {day}"))
    db.flush()

    login(w.hugo)
    response = client.get(f"/api/me/projects/{project_id}")
    assert response.status_code == 200, response.text
    project = response.json()
    assert project["name"] == "Elinstallation i villa"
    assert project["owner"]["name"] == w.teacher.name
    # Bara Hugos egna redovisningar, senaste först. Majas syns inte.
    assert [r["excerpt"]["text"] for r in project["reports"]] == ["Svar 9", "Svar 6"]
    assert "email" not in project["students"][0]

    # En elev som inte är med i projektet får 404, och läraren använder sin egen endpoint.
    login(w.stranger)
    assert client.get(f"/api/me/projects/{project_id}").status_code == 404
    login(w.teacher)
    assert client.get(f"/api/me/projects/{project_id}").status_code == 403
