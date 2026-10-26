"""En klass per elev och elevsidan: praktikplatser, närvaro och redovisningar per elev."""

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.attendance import Attendance, AttendanceStatus
from app.models.placement import Placement, Workplace
from app.models.report import FormVersion, Report, ReportStatus
from app.models.school import School
from app.models.school_class import SchoolClass, class_students, teacher_students
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]

TODAY = date(2026, 10, 21)  # onsdag
NOW = datetime(2026, 10, 21, 7, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def fixed_time() -> Iterator[None]:
    with (
        patch("app.core.time.today", return_value=TODAY),
        patch("app.core.time.now", return_value=NOW),
    ):
        yield


@dataclass
class World:
    teacher: User
    other_teacher: User
    admin: User
    student: User
    supervisor: User
    ee22: SchoolClass
    ee21: SchoolClass
    other_class: SchoolClass
    placement: Placement


@pytest.fixture
def w(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> World:
    kramfors = make_school("Kramforsskolan")
    teacher = make_user(email="ingrid@kramfors.se", in_school=kramfors)
    other = make_user(email="per@kramfors.se", in_school=kramfors)
    admin = make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors)
    student = make_user(email="hugo@kramfors.se", role=UserRole.STUDENT, in_school=kramfors)
    supervisor = make_user(email="gustav@elbolaget.se", role=UserRole.SUPERVISOR)
    ee22 = SchoolClass(
        school_id=kramfors.id, name="EE22", teachers=[teacher], students=[student],
        apl_days_per_week=5,
    )  # fmt: skip
    ee21 = SchoolClass(school_id=kramfors.id, name="EE21", teachers=[teacher])
    other_class = SchoolClass(school_id=kramfors.id, name="BA23", teachers=[other])
    workplace = Workplace(school_id=kramfors.id, name="Elbolaget", supervisors=[supervisor])
    db.add_all([ee22, ee21, other_class, workplace])
    db.flush()
    db.execute(teacher_students.insert().values(teacher_id=teacher.id, student_id=student.id))
    placement = Placement(
        student=student,
        workplace=workplace,
        supervisor=supervisor,
        start_date=date(2026, 10, 12),
        end_date=date(2026, 12, 4),
    )
    db.add(placement)
    db.flush()
    return World(teacher, other, admin, student, supervisor, ee22, ee21, other_class, placement)


# --- En klass per elev --------------------------------------------------------------------


def test_adding_student_in_other_class_asks_to_move(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    login(w.teacher)
    url = f"/api/classes/{w.ee21.id}/students"
    response = client.post(url, json={"student_id": str(w.student.id)})
    assert response.status_code == 409
    assert response.json()["detail"] == "Testperson går i EE22. En elev kan bara gå i en klass."

    moved = client.post(url, json={"student_id": str(w.student.id), "move": True})
    assert moved.status_code == 201
    classes = db.scalars(
        select(class_students.c.class_id).where(class_students.c.student_id == w.student.id)
    ).all()
    assert classes == [w.ee21.id]


def test_adding_to_same_class_again_is_fine(client: TestClient, login: Login, w: World) -> None:
    login(w.teacher)
    url = f"/api/classes/{w.ee22.id}/students"
    assert client.post(url, json={"student_id": str(w.student.id)}).status_code == 201


def test_new_student_gets_at_most_one_class(client: TestClient, login: Login, w: World) -> None:
    login(w.admin)
    response = client.post(
        "/api/students",
        json={
            "name": "Ny",
            "email": "ny@kramfors.se",
            "class_ids": [str(w.ee21.id), str(w.ee22.id)],
        },
    )
    assert response.status_code == 422


# --- Elevens etiketter ---------------------------------------------------------------------


def add_report(db: Session, w: World, school_class: SchoolClass, day: date) -> Report:
    version = db.scalar(select(FormVersion).where(FormVersion.class_id == school_class.id))
    if version is None:
        version = FormVersion(class_id=school_class.id, version=1, questions=[])
        db.add(version)
        db.flush()
    report = Report(
        class_id=school_class.id,
        student_id=w.student.id,
        form_version_id=version.id,
        due_date=day,
        status=ReportStatus.SUBMITTED,
        submitted_at=NOW,
    )
    db.add(report)
    db.flush()
    return report


def test_student_shows_workplace_and_report_count(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    add_report(db, w, w.ee22, date(2026, 10, 16))
    add_report(db, w, w.ee22, date(2026, 10, 20))
    login(w.teacher)
    body = client.get(f"/api/students/{w.student.id}").json()
    assert body["workplace"] == {"id": str(w.placement.workplace_id), "name": "Elbolaget"}
    assert body["report_count"] == 2


# --- Elevsidan -----------------------------------------------------------------------------


def test_student_placements(client: TestClient, login: Login, w: World) -> None:
    login(w.teacher)
    body = client.get(f"/api/students/{w.student.id}/placements").json()
    assert [(p["workplace"]["name"], p["start_date"]) for p in body] == [
        ("Elbolaget", "2026-10-12")
    ]
    login(w.other_teacher)
    assert client.get(f"/api/students/{w.student.id}/placements").status_code == 404


def test_student_attendance_defaults_to_current_placement(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    for day, s in [
        (date(2026, 10, 12), AttendanceStatus.PRESENT),
        (date(2026, 10, 13), AttendanceStatus.SICK),
        (TODAY, AttendanceStatus.PRESENT),
    ]:
        db.add(
            Attendance(
                placement_id=w.placement.id,
                date=day,
                status=s,
                checked_in_at=NOW if s == AttendanceStatus.PRESENT else None,
            )
        )
    db.flush()
    login(w.teacher)
    body = client.get(f"/api/students/{w.student.id}/attendance").json()
    assert (body["from_date"], body["to_date"]) == ("2026-10-12", "2026-10-21")
    summary = body["summary"]
    # 12–21 oktober har åtta vardagar.
    assert (summary["expected_days"], summary["present"], summary["sick"]) == (8, 2, 1)
    assert summary["missing"] == 5
    assert summary["today"] == "present"
    assert [d["date"] for d in body["days"]] == ["2026-10-21", "2026-10-13", "2026-10-12"]


def test_admin_sees_student_attendance(client: TestClient, login: Login, w: World) -> None:
    login(w.admin)
    assert client.get(f"/api/students/{w.student.id}/attendance").status_code == 200


def test_other_teacher_cannot_see_student_attendance(
    client: TestClient, login: Login, w: World
) -> None:
    login(w.other_teacher)
    assert client.get(f"/api/students/{w.student.id}/attendance").status_code == 404


def test_student_reports_only_from_taught_classes(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    add_report(db, w, w.ee22, date(2026, 10, 16))
    add_report(db, w, w.other_class, date(2026, 10, 20))
    login(w.teacher)
    body = client.get(f"/api/students/{w.student.id}/reports").json()
    assert [(r["class_name"], r["due_date"], r["is_read"]) for r in body] == [
        ("EE22", "2026-10-16", False)
    ]


def test_only_teachers_list_student_reports(client: TestClient, login: Login, w: World) -> None:
    login(w.admin)
    assert client.get(f"/api/students/{w.student.id}/reports").status_code == 403
    login(w.student)
    assert client.get(f"/api/students/{w.student.id}/reports").status_code == 403
