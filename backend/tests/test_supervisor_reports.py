"""Handledaren läser och kommenterar elevens redovisningar (Texas, 2026-10-29).

Handledaren ser bara redovisningar för dagar då eleven var placerad hos hen.
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.invitation import Notification
from app.models.placement import Placement, Workplace
from app.models.report import FormVersion, Report, ReportAnswer, ReportStatus
from app.models.school import School
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]
QUESTION = uuid.UUID("00000000-0000-4000-8000-000000000001")


@dataclass
class World:
    teacher: User
    hugo: User
    maja: User
    gustav: User
    sofia: User
    reports: dict[str, Report]


def _report(
    db: Session,
    school_class: SchoolClass,
    form: FormVersion,
    student: User,
    day: date,
    *,
    submitted: bool = True,
    text: str = "",
) -> Report:
    report = Report(
        class_id=school_class.id,
        student_id=student.id,
        form_version_id=form.id,
        due_date=day,
        status=ReportStatus.SUBMITTED if submitted else ReportStatus.DRAFT,
        submitted_at=datetime(day.year, day.month, day.day, 15, tzinfo=UTC) if submitted else None,
    )
    db.add(report)
    db.flush()
    if text:
        db.add(ReportAnswer(report_id=report.id, question_id=QUESTION, text=text))
    return report


@pytest.fixture
def w(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> World:
    school = make_school("Kramforsskolan")
    teacher = make_user(email="ingrid@kramfors.se", in_school=school)
    hugo = make_user(email="hugo@kramfors.se", role=UserRole.STUDENT, in_school=school)
    maja = make_user(email="maja@kramfors.se", role=UserRole.STUDENT, in_school=school)
    gustav = make_user(email="gustav@kramforsel.se", role=UserRole.SUPERVISOR, in_school=None)
    gustav.name = "Gustav Lindahl"
    sofia = make_user(email="sofia@hogakusten.se", role=UserRole.SUPERVISOR, in_school=None)
    ee22 = SchoolClass(school_id=school.id, name="EE22", teachers=[teacher], students=[hugo, maja])
    kramfors = Workplace(school_id=school.id, name="Kramfors El", supervisors=[gustav])
    hoga = Workplace(school_id=school.id, name="Höga Kusten El", supervisors=[sofia])
    db.add_all([ee22, kramfors, hoga])
    db.flush()
    # Hugo var hos Sofia i september och är hos Gustav i oktober. Maja är hos Sofia.
    db.add_all(
        [
            Placement(
                student_id=hugo.id,
                workplace_id=hoga.id,
                supervisor_id=sofia.id,
                start_date=date(2026, 9, 1),
                end_date=date(2026, 9, 30),
            ),
            Placement(
                student_id=hugo.id,
                workplace_id=kramfors.id,
                supervisor_id=gustav.id,
                start_date=date(2026, 10, 1),
                end_date=date(2026, 11, 30),
            ),
            Placement(
                student_id=maja.id,
                workplace_id=hoga.id,
                supervisor_id=sofia.id,
                start_date=date(2026, 10, 1),
                end_date=date(2026, 11, 30),
            ),
        ]
    )
    form = FormVersion(
        class_id=ee22.id,
        version=1,
        questions=[{"id": str(QUESTION), "type": "long_text", "title": "Vad har du gjort?"}],
    )
    db.add(form)
    db.flush()
    reports = {
        "hugo_sep": _report(db, ee22, form, hugo, date(2026, 9, 15), text="Hos Sofia"),
        "hugo_oct": _report(db, ee22, form, hugo, date(2026, 10, 6), text="Drog kabel"),
        "hugo_oct2": _report(db, ee22, form, hugo, date(2026, 10, 13), text="Bytte belysning"),
        "hugo_draft": _report(db, ee22, form, hugo, date(2026, 10, 20), submitted=False),
        "maja_oct": _report(db, ee22, form, maja, date(2026, 10, 6), text="Mätte"),
    }
    return World(teacher, hugo, maja, gustav, sofia, reports)


def test_supervisor_lists_reports_from_own_period(
    client: TestClient, login: Login, w: World
) -> None:
    login(w.gustav)
    rows = client.get("/api/supervisor/reports").json()
    assert [r["id"] for r in rows] == [
        str(w.reports["hugo_oct2"].id),
        str(w.reports["hugo_oct"].id),
    ]
    assert rows[0]["excerpt"]["text"] == "Bytte belysning"
    assert rows[0]["class_name"] == "EE22"
    assert rows[0]["is_read"] is False

    # Sofia ser Hugos redovisning från september och Majas, men inte Hugos från oktober.
    login(w.sofia)
    ids = {r["id"] for r in client.get("/api/supervisor/reports").json()}
    assert ids == {str(w.reports["hugo_sep"].id), str(w.reports["maja_oct"].id)}


def test_supervisor_opens_only_reports_from_own_period(
    client: TestClient, login: Login, w: World
) -> None:
    login(w.gustav)
    assert client.get(f"/api/reports/{w.reports['hugo_oct'].id}").status_code == 200
    for key in ("hugo_sep", "hugo_draft", "maja_oct"):
        assert client.get(f"/api/reports/{w.reports[key].id}").status_code == 404, key


def test_supervisor_marks_read_and_comments(
    client: TestClient, db: Session, login: Login, w: World
) -> None:
    report = w.reports["hugo_oct"]
    login(w.gustav)
    assert client.post(f"/api/reports/{report.id}/read").status_code == 204
    assert client.get(f"/api/reports/{report.id}").json()["is_read"] is True

    response = client.post(f"/api/reports/{report.id}/comments", json={"body": "Snyggt jobbat!"})
    assert response.status_code == 201, response.text
    assert response.json()["author_role"] == "supervisor"

    # Eleven får en notis. Läraren får ingen.
    notices = db.scalars(select(Notification).where(Notification.user_id == w.hugo.id)).all()
    assert [n.link for n in notices] == [f"/my-reports/{report.id}"]
    assert notices[0].text == "Gustav Lindahl kommenterade din redovisning"
    assert not db.scalars(select(Notification).where(Notification.user_id == w.teacher.id)).all()

    # Eleven och läraren ser kommentaren.
    login(w.teacher)
    comments = client.get(f"/api/reports/{report.id}").json()["comments"]
    assert [c["body"] for c in comments] == ["Snyggt jobbat!"]

    # En annan handledare kan inte kommentera.
    login(w.sofia)
    assert (
        client.post(f"/api/reports/{report.id}/comments", json={"body": "Hej"}).status_code == 404
    )


def test_only_supervisors_list_supervisor_reports(
    client: TestClient, login: Login, w: World
) -> None:
    login(w.teacher)
    assert client.get("/api/supervisor/reports").status_code == 403
    login(w.hugo)
    assert client.get("/api/supervisor/reports").status_code == 403
