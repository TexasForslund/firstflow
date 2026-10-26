"""Lärarens översikt (F6): dagens närvaro, uppmärksamhet och olästa redovisningar."""

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.attendance import Attendance, AttendanceStatus
from app.models.placement import Placement, Workplace
from app.models.report import FormVersion, Report, ReportAnswer, ReportRead, ReportStatus
from app.models.school import School
from app.models.school_class import SchoolClass, class_students
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]

TODAY = date(2026, 10, 21)  # onsdag
NOW = datetime(2026, 10, 21, 10, 0, tzinfo=UTC)
START = date(2026, 10, 12)


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
    hugo: User
    maja: User
    liam: User
    ee22: SchoolClass
    version: FormVersion
    question_id: str


def weekdays(start: date, end: date) -> list[date]:
    days = [start + timedelta(days=n) for n in range((end - start).days + 1)]
    return [d for d in days if d.weekday() < 5]


@pytest.fixture
def w(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> World:
    school = make_school("Kramforsskolan")
    teacher = make_user(email="ingrid@kramfors.se", in_school=school)
    other = make_user(email="per@kramfors.se", in_school=school)

    def student(slug: str, name: str) -> User:
        user = make_user(email=f"{slug}@kramfors.se", role=UserRole.STUDENT, in_school=school)
        user.name = name
        return user

    hugo = student("hugo", "Hugo")
    maja = student("maja", "Maja")
    liam = student("liam", "Liam")
    supervisor = make_user(email="gustav@elbolaget.se", role=UserRole.SUPERVISOR)
    ee22 = SchoolClass(
        school_id=school.id,
        name="EE22",
        teachers=[teacher],
        students=[hugo, maja, liam],
        report_due_weekdays=[1, 4],  # tisdag och fredag
    )
    workplace = Workplace(school_id=school.id, name="Elbolaget", supervisors=[supervisor])
    db.add_all([ee22, workplace])
    db.flush()

    question_id = str(uuid4())
    # Frågorna publicerades onsdag 14 oktober: redovisning fredag 16 och tisdag 20.
    version = FormVersion(
        class_id=ee22.id,
        version=1,
        questions=[
            {"id": str(uuid4()), "type": "yes_no", "title": "Var det bra?"},
            {"id": question_id, "type": "long_text", "title": "Vad har du gjort?"},
        ],
        published_at=datetime(2026, 10, 14, 6, 0, tzinfo=UTC),
    )
    db.add(version)
    db.execute(update(class_students).values(created_at=datetime(2026, 8, 1, tzinfo=UTC)))

    for student in (hugo, maja):
        placement = Placement(
            student=student,
            workplace=workplace,
            supervisor=supervisor,
            start_date=START,
            end_date=date(2026, 12, 4),
        )
        db.add(placement)
        db.flush()
        # Hugo checkar in varje dag. Maja slutade efter första veckan.
        last = TODAY if student is hugo else date(2026, 10, 16)
        for day in weekdays(START, last):
            db.add(
                Attendance(
                    placement_id=placement.id,
                    date=day,
                    status=AttendanceStatus.PRESENT,
                    checked_in_at=NOW,
                )
            )
    db.flush()
    return World(teacher, other, hugo, maja, liam, ee22, version, question_id)


def submit(db: Session, w: World, student: User, day: date, text: str = "Drog kabel") -> Report:
    report = Report(
        class_id=w.ee22.id,
        student_id=student.id,
        form_version_id=w.version.id,
        due_date=day,
        status=ReportStatus.SUBMITTED,
        submitted_at=datetime.combine(day, datetime.min.time(), UTC) + timedelta(hours=14),
    )
    db.add(report)
    db.flush()
    db.add(ReportAnswer(report_id=report.id, question_id=w.question_id, text=text))
    db.flush()
    return report


def test_overview_today(client: TestClient, login: Login, w: World) -> None:
    login(w.teacher)
    body = client.get("/api/teacher/overview").json()
    assert body["today"] == "2026-10-21"
    assert (body["on_apl"], body["checked_in"]) == (2, 1)
    assert body["classes"] == [{"id": str(w.ee22.id), "name": "EE22", "on_apl": 2, "checked_in": 1}]


def test_overview_attention_most_important_first(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    submit(db, w, w.hugo, date(2026, 10, 16))
    submit(db, w, w.hugo, date(2026, 10, 20))
    submit(db, w, w.maja, date(2026, 10, 16))
    login(w.teacher)
    body = client.get("/api/teacher/overview").json()
    assert [(a["student"]["name"], a["reason"], a["count"]) for a in body["attention"]] == [
        # Maja har inte checkat in 19, 20 och 21 oktober.
        ("Maja", "missing_check_ins", 3),
        ("Liam", "missing_reports", 2),
        ("Maja", "missing_reports", 1),
        ("Liam", "no_placement", 0),
    ]
    assert body["attention"][0]["class_name"] == "EE22"


def test_overview_unread_reports_with_preview(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    read = submit(db, w, w.hugo, date(2026, 10, 16))
    db.add(ReportRead(report_id=read.id, user_id=w.teacher.id))
    newest = submit(db, w, w.hugo, date(2026, 10, 20), text="x" * 400)
    older = submit(db, w, w.maja, date(2026, 10, 16), text="  Monterade uttag  ")
    db.flush()
    login(w.teacher)
    body = client.get("/api/teacher/overview").json()
    assert body["unread_reports"] == 2
    assert [r["id"] for r in body["reports"]] == [str(newest.id), str(older.id)]
    preview = body["reports"][1]["preview"]
    assert preview == [{"question": "Vad har du gjort?", "text": "Monterade uttag"}]
    assert body["reports"][0]["preview"][0]["text"] == "x" * 300 + "…"
    assert body["reports"][0]["class_name"] == "EE22"
    assert body["reports"][0]["is_late"] is False


def test_no_apl_on_weekends(client: TestClient, login: Login, w: World) -> None:
    login(w.teacher)
    with patch("app.core.time.today", return_value=date(2026, 10, 24)):
        body = client.get("/api/teacher/overview").json()
    assert (body["on_apl"], body["checked_in"]) == (0, 0)


def test_other_teacher_sees_nothing(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    submit(db, w, w.hugo, date(2026, 10, 16))
    login(w.other_teacher)
    body = client.get("/api/teacher/overview").json()
    assert (body["on_apl"], body["classes"], body["attention"]) == (0, [], [])
    assert (body["unread_reports"], body["reports"]) == (0, [])


@pytest.mark.parametrize("role", [UserRole.STUDENT, UserRole.SCHOOL_ADMIN, UserRole.SUPERVISOR])
def test_only_teachers(
    client: TestClient, login: Login, make_user: MakeUser, role: UserRole
) -> None:
    login(make_user(email=f"{role.value}@kramfors.se", role=role))
    assert client.get("/api/teacher/overview").status_code == 403


def test_requires_login(client: TestClient) -> None:
    assert client.get("/api/teacher/overview").status_code == 401


# --- Elevsidan ----------------------------------------------------------------------------


def test_student_attention(client: TestClient, login: Login, w: World, db: Session) -> None:
    submit(db, w, w.maja, date(2026, 10, 16))
    login(w.teacher)
    maja = client.get(f"/api/students/{w.maja.id}/attention").json()
    assert [(i["reason"], i["count"]) for i in maja["items"]] == [
        ("missing_check_ins", 3),
        ("missing_reports", 1),
    ]
    assert maja["missing_report_days"] == ["2026-10-20"]
    liam = client.get(f"/api/students/{w.liam.id}/attention").json()
    assert [i["reason"] for i in liam["items"]] == ["missing_reports", "no_placement"]
    assert liam["missing_report_days"] == ["2026-10-20", "2026-10-16"]


def test_student_attention_access(
    client: TestClient, login: Login, w: World, make_user: MakeUser
) -> None:
    login(w.other_teacher)
    assert client.get(f"/api/students/{w.hugo.id}/attention").status_code == 404
    login(make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=w.ee22.school))
    assert client.get(f"/api/students/{w.hugo.id}/attention").status_code == 200


def test_student_reports_have_all_text_answers(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    submit(db, w, w.hugo, date(2026, 10, 16), text="  Drog kabel  ")
    login(w.teacher)
    body = client.get(f"/api/students/{w.hugo.id}/reports").json()
    assert body[0]["answers"] == [
        {"question_id": w.question_id, "question": "Vad har du gjort?", "text": "Drog kabel"}
    ]
