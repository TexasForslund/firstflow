"""Sidan Redovisningar för läraren: alla redovisningar, saknade och per elev."""

from collections.abc import Callable
from datetime import UTC, date, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.report import CommentVisibility, ReportComment, ReportRead
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole

# Samma klass och tider som Översikten: frågor publicerade 14 oktober, redovisning tisdag
# och fredag, i dag onsdag 21 oktober.
from tests import test_overview
from tests.test_overview import World, submit

# Översiktens fixturer: klassen och den fasta tiden.
w = test_overview.w
fixed_time = test_overview.fixed_time

Login = Callable[[User], None]


def names(body: dict) -> list[tuple[str, str]]:
    return [(r["student"]["name"], r["due_date"]) for r in body["reports"]]


def test_list_all_newest_first_with_excerpt_and_counts(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    submit(db, w, w.hugo, date(2026, 10, 16))
    maja = submit(db, w, w.maja, date(2026, 10, 16), text="  Monterade uttag  ")
    maja.submitted_at = datetime(2026, 10, 16, 15, 0, tzinfo=UTC)
    submit(db, w, w.hugo, date(2026, 10, 20), text="x" * 400)
    login(w.teacher)

    body = client.get("/api/teacher/reports").json()
    assert names(body) == [
        ("Hugo", "2026-10-20"),
        ("Maja", "2026-10-16"),
        ("Hugo", "2026-10-16"),
    ]
    first = body["reports"][0]
    assert first["school_class"]["name"] == "EE22"
    assert first["excerpt"]["question"] == "Vad har du gjort?"
    assert first["excerpt"]["text"] == "x" * 200 + "…"
    assert body["reports"][1]["excerpt"]["text"] == "Monterade uttag"
    assert first["is_read"] is False and first["is_late"] is False
    # Saknas: Maja 20, Liam 16 och 20 (som på Översikten).
    assert body["counts"] == {
        "all": 3,
        "unread": 3,
        "late": 0,
        "comments": 0,
        "private": 0,
        "missing": 3,
    }
    assert body["has_more"] is False

    limited = client.get("/api/teacher/reports", params={"limit": 2}).json()
    assert len(limited["reports"]) == 2 and limited["has_more"] is True


def test_quick_filters(client: TestClient, login: Login, w: World, db: Session) -> None:
    read = submit(db, w, w.hugo, date(2026, 10, 16))
    db.add(ReportRead(report_id=read.id, user_id=w.teacher.id))
    late = submit(db, w, w.maja, date(2026, 10, 16))
    late.submitted_at = datetime(2026, 10, 17, 9, 0, tzinfo=UTC)
    commented = submit(db, w, w.hugo, date(2026, 10, 20))
    db.add_all(
        [
            ReportComment(report_id=commented.id, author_id=w.teacher.id, body="Bra"),
            ReportComment(
                report_id=late.id,
                author_id=w.teacher.id,
                body="Stämmer det?",
                visibility=CommentVisibility.STAFF,
            ),
        ]
    )
    db.flush()
    login(w.teacher)

    def show(value: str) -> list[tuple[str, str]]:
        return names(client.get("/api/teacher/reports", params={"show": value}).json())

    assert show("unread") == [("Hugo", "2026-10-20"), ("Maja", "2026-10-16")]
    assert show("late") == [("Maja", "2026-10-16")]
    assert show("comments") == [("Hugo", "2026-10-20"), ("Maja", "2026-10-16")]
    assert show("private") == [("Maja", "2026-10-16")]

    body = client.get("/api/teacher/reports").json()
    assert body["counts"]["unread"] == 2
    assert body["counts"]["late"] == 1
    assert body["counts"]["comments"] == 2
    assert body["counts"]["private"] == 1
    maja = next(r for r in body["reports"] if r["student"]["name"] == "Maja")
    assert maja["is_late"] is True
    assert maja["has_private_comment"] is True
    assert maja["comment_count"] == 1


def test_filter_by_student_and_project(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    project = Project(school_id=w.ee22.school_id, owner_id=w.teacher.id, name="Egenkontroll")
    db.add(project)
    db.flush()
    in_project = submit(db, w, w.hugo, date(2026, 10, 16))
    in_project.project_id = project.id
    submit(db, w, w.hugo, date(2026, 10, 20))
    submit(db, w, w.maja, date(2026, 10, 16))
    db.flush()
    login(w.teacher)

    hugo = client.get("/api/teacher/reports", params={"student_id": str(w.hugo.id)}).json()
    assert names(hugo) == [("Hugo", "2026-10-20"), ("Hugo", "2026-10-16")]
    assert hugo["counts"]["missing"] == 0

    by_project = client.get("/api/teacher/reports", params={"project_id": str(project.id)}).json()
    assert names(by_project) == [("Hugo", "2026-10-16")]
    assert by_project["reports"][0]["project"]["name"] == "Egenkontroll"
    # Saknade redovisningar hör inte till ett projekt.
    assert by_project["counts"]["missing"] == 0


def test_missing(client: TestClient, login: Login, w: World, db: Session) -> None:
    submit(db, w, w.hugo, date(2026, 10, 16))
    submit(db, w, w.hugo, date(2026, 10, 20))
    submit(db, w, w.maja, date(2026, 10, 16))
    login(w.teacher)

    body = client.get("/api/teacher/reports/missing").json()
    assert [(m["student"]["name"], m["due_date"]) for m in body] == [
        ("Liam", "2026-10-20"),
        ("Maja", "2026-10-20"),
        ("Liam", "2026-10-16"),
    ]
    assert body[0]["school_class"]["name"] == "EE22"
    liam = client.get("/api/teacher/reports/missing", params={"student_id": str(w.liam.id)})
    assert len(liam.json()) == 2


def test_per_student(client: TestClient, login: Login, w: World, db: Session) -> None:
    read = submit(db, w, w.hugo, date(2026, 10, 16))
    db.add(ReportRead(report_id=read.id, user_id=w.teacher.id))
    submit(db, w, w.hugo, date(2026, 10, 20))
    login(w.teacher)

    body = client.get("/api/teacher/reports/students").json()
    rows = {r["student"]["name"]: r for r in body}
    assert list(rows) == ["Hugo", "Liam", "Maja"]
    assert rows["Hugo"]["unread"] == 1
    assert rows["Hugo"]["missing"] == 0
    assert rows["Hugo"]["last_submitted_at"].startswith("2026-10-20")
    assert rows["Liam"] == {
        "student": {"id": str(w.liam.id), "name": "Liam"},
        "school_class": {"id": str(w.ee22.id), "name": "EE22"},
        "last_submitted_at": None,
        "unread": 0,
        "missing": 2,
    }


def test_only_own_classes(
    client: TestClient, login: Login, w: World, db: Session, make_user: Callable[..., User]
) -> None:
    submit(db, w, w.hugo, date(2026, 10, 16))
    # En annan lärare på samma skola ser inget, och kan inte välja klassen.
    login(w.other_teacher)
    assert client.get("/api/teacher/reports").json()["reports"] == []
    assert client.get("/api/teacher/reports/missing").json() == []
    assert client.get("/api/teacher/reports/students").json() == []
    params = {"class_id": str(w.ee22.id)}
    assert client.get("/api/teacher/reports", params=params).status_code == 404
    assert client.get("/api/teacher/reports/missing", params=params).status_code == 404

    # Läraren väljer sin egen klass.
    login(w.teacher)
    own = client.get("/api/teacher/reports", params=params).json()
    assert len(own["reports"]) == 1

    # En annan klass på skolan som läraren inte undervisar.
    other = SchoolClass(school_id=w.ee22.school_id, name="EE23", teachers=[w.other_teacher])
    db.add(other)
    db.flush()
    other_params = {"class_id": str(other.id)}
    assert client.get("/api/teacher/reports", params=other_params).status_code == 404


def test_teachers_only(
    client: TestClient, login: Login, w: World, make_user: Callable[..., User]
) -> None:
    login(w.hugo)
    assert client.get("/api/teacher/reports").status_code == 403
    login(make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=w.ee22.school))
    assert client.get("/api/teacher/reports/students").status_code == 403
