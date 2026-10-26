"""Närvaro och incheckning (B4)."""

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.attendance import Attendance, AttendanceStatus
from app.models.placement import Placement, Workplace
from app.models.school import School
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]

TODAY = date(2026, 10, 21)  # onsdag
NOW = datetime(2026, 10, 21, 6, 52, tzinfo=UTC)  # 07:52 svensk tid
START = date(2026, 10, 12)  # måndag, vecka 1
END = date(2026, 11, 20)


@dataclass
class World:
    teacher: User
    other_teacher: User
    umea_teacher: User
    admin: User
    principal: User
    student: User  # i EE22, placerad
    second: User  # i EE22, placerad, checkar aldrig in
    unplaced: User  # i EE22, ingen placering
    supervisor: User
    other_supervisor: User
    ee22: SchoolClass
    placement: Placement


@pytest.fixture(autouse=True)
def fixed_time() -> Iterator[None]:
    with (
        patch("app.core.time.today", return_value=TODAY),
        patch("app.core.time.now", return_value=NOW),
    ):
        yield


@pytest.fixture
def world(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> World:
    kramfors, umea = make_school("Kramforsskolan"), make_school("Umeåskolan")
    teacher = make_user(email="ingrid@kramfors.se", in_school=kramfors)
    other_teacher = make_user(email="per@kramfors.se", in_school=kramfors)
    umea_teacher = make_user(email="anders@umea.se", in_school=umea)
    admin = make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors)
    principal = make_user(email="rektor@kramfors.se", role=UserRole.PRINCIPAL, in_school=kramfors)
    student = make_user(email="hugo@kramfors.se", role=UserRole.STUDENT, in_school=kramfors)
    second = make_user(email="maja@kramfors.se", role=UserRole.STUDENT, in_school=kramfors)
    unplaced = make_user(email="liam@kramfors.se", role=UserRole.STUDENT, in_school=kramfors)
    supervisor = make_user(email="gustav@elbolaget.se", role=UserRole.SUPERVISOR)
    other_supervisor = make_user(email="lisa@bygg.se", role=UserRole.SUPERVISOR)
    ee22 = SchoolClass(
        school_id=kramfors.id,
        name="EE22",
        teachers=[teacher],
        students=[student, second, unplaced],
        apl_days_per_week=5,
    )
    workplace = Workplace(
        school_id=kramfors.id, name="Elbolaget", supervisors=[supervisor, other_supervisor]
    )
    db.add_all([ee22, workplace])
    db.flush()
    placement = Placement(
        student=student, workplace=workplace, supervisor=supervisor, start_date=START, end_date=END
    )
    db.add_all(
        [
            placement,
            Placement(
                student=second,
                workplace=workplace,
                supervisor=supervisor,
                start_date=START,
                end_date=END,
            ),
        ]
    )
    db.flush()
    return World(
        teacher,
        other_teacher,
        umea_teacher,
        admin,
        principal,
        student,
        second,
        unplaced,
        supervisor,
        other_supervisor,
        ee22,
        placement,
    )


# --- Incheckning ---------------------------------------------------------------------------


def test_check_in_today(client: TestClient, login: Login, world: World) -> None:
    login(world.student)
    response = client.post("/api/attendance/check-in")
    assert response.status_code == 200
    body = response.json()
    assert body["date"] == "2026-10-21"
    assert body["status"] == "present"
    assert datetime.fromisoformat(body["checked_in_at"]) == NOW

    # Ett andra tryck ger samma incheckning tillbaka.
    with patch("app.core.time.now", return_value=NOW + timedelta(hours=2)):
        again = client.post("/api/attendance/check-in")
    assert again.status_code == 200
    assert again.json()["checked_in_at"] == body["checked_in_at"]


def test_no_check_in_on_weekend(client: TestClient, login: Login, world: World) -> None:
    login(world.student)
    with patch("app.core.time.today", return_value=date(2026, 10, 24)):
        response = client.post("/api/attendance/check-in")
    assert response.status_code == 422
    assert response.json()["detail"] == "Det finns ingen APL på helger"


def test_no_check_in_without_placement(client: TestClient, login: Login, world: World) -> None:
    login(world.unplaced)
    response = client.post("/api/attendance/check-in")
    assert response.status_code == 422
    assert response.json()["detail"] == "Du har ingen pågående APL i dag"


@pytest.mark.parametrize("role", ["teacher", "supervisor", "admin"])
def test_only_students_check_in(client: TestClient, login: Login, world: World, role: str) -> None:
    login(getattr(world, role))
    assert client.post("/api/attendance/check-in").status_code == 403


def test_requires_login(client: TestClient, world: World) -> None:
    assert client.post("/api/attendance/check-in").status_code == 401
    assert client.get("/api/me/attendance").status_code == 401


# --- Frånvaro ------------------------------------------------------------------------------


def test_absence_cannot_be_reported(client: TestClient, login: Login, world: World) -> None:
    """Frånvaroanmälan är borttagen (Texas, 2026-10-26)."""
    login(world.student)
    response = client.post("/api/attendance/absence", json={"date": "2026-10-22", "status": "sick"})
    assert response.status_code in (404, 405)


# --- Elevens egen närvaro ------------------------------------------------------------------


def test_my_attendance(client: TestClient, login: Login, world: World) -> None:
    login(world.student)
    client.post("/api/attendance/check-in")
    body = client.get("/api/me/attendance").json()
    assert body["placement_id"] == str(world.placement.id)
    assert body["workplace_name"] == "Elbolaget"
    assert body["check_in_required"] is True
    assert body["can_check_in_today"] is True
    assert [(d["date"], d["status"]) for d in body["days"]] == [
        ("2026-10-21", "present"),
    ]


def test_my_attendance_without_placement(client: TestClient, login: Login, world: World) -> None:
    login(world.unplaced)
    body = client.get("/api/me/attendance").json()
    assert body["placement_id"] is None
    assert body["can_check_in_today"] is False
    assert body["days"] == []


# --- Klassens närvaro ----------------------------------------------------------------------


def add(db: Session, placement: Placement, day: date, s: AttendanceStatus) -> None:
    db.add(
        Attendance(
            placement_id=placement.id,
            date=day,
            status=s,
            checked_in_at=NOW if s == AttendanceStatus.PRESENT else None,
        )
    )
    db.flush()


def test_class_attendance_counts(
    client: TestClient, login: Login, world: World, db: Session
) -> None:
    # Vecka 1 (12–16 okt) och 19–21 okt: 8 vardagar fram till och med i dag.
    for offset in range(5):
        add(db, world.placement, START + timedelta(days=offset), AttendanceStatus.PRESENT)
    add(db, world.placement, TODAY, AttendanceStatus.PRESENT)
    # En gammal anmäld frånvaro räknas som ej incheckad.
    add(db, world.placement, date(2026, 10, 20), AttendanceStatus.SICK)

    login(world.teacher)
    response = client.get(
        f"/api/classes/{world.ee22.id}/attendance",
        params={"from": "2026-10-12", "to": "2026-10-23"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["check_in_required"] is True
    by_id = {s["student"]["id"]: s for s in body["students"]}
    hugo = by_id[str(world.student.id)]
    assert (hugo["expected_days"], hugo["present"], hugo["missing"]) == (8, 6, 2)
    assert "sick" not in hugo
    assert hugo["today"] == "present"
    maja = by_id[str(world.second.id)]
    assert (maja["expected_days"], maja["present"], maja["missing"]) == (8, 0, 8)
    assert maja["today"] is None
    liam = by_id[str(world.unplaced.id)]
    assert (liam["has_placement"], liam["expected_days"], liam["missing"]) == (False, 0, 0)


def test_class_attendance_uses_days_per_week(
    client: TestClient, login: Login, world: World, db: Session
) -> None:
    world.ee22.apl_days_per_week = 3
    db.flush()
    login(world.teacher)
    body = client.get(
        f"/api/classes/{world.ee22.id}/attendance",
        params={"from": "2026-10-12", "to": "2026-10-16"},
    ).json()
    maja = next(s for s in body["students"] if s["student"]["id"] == str(world.second.id))
    assert (maja["expected_days"], maja["missing"]) == (3, 3)


def test_no_missing_when_check_in_not_required(
    client: TestClient, login: Login, world: World, db: Session
) -> None:
    world.ee22.check_in_required = False
    db.flush()
    login(world.teacher)
    body = client.get(f"/api/classes/{world.ee22.id}/attendance").json()
    assert body["check_in_required"] is False
    assert all(s["missing"] == 0 for s in body["students"])


def test_class_attendance_default_period(client: TestClient, login: Login, world: World) -> None:
    login(world.teacher)
    body = client.get(f"/api/classes/{world.ee22.id}/attendance").json()
    assert (body["from_date"], body["to_date"]) == ("2026-09-24", "2026-10-21")


def test_class_attendance_bad_period(client: TestClient, login: Login, world: World) -> None:
    login(world.teacher)
    url = f"/api/classes/{world.ee22.id}/attendance"
    assert client.get(url, params={"from": "2026-10-20", "to": "2026-10-01"}).status_code == 422
    assert client.get(url, params={"from": "2024-01-01", "to": "2026-10-01"}).status_code == 422


@pytest.mark.parametrize("role", ["admin", "principal"])
def test_school_staff_see_class_attendance(
    client: TestClient, login: Login, world: World, role: str
) -> None:
    login(getattr(world, role))
    assert client.get(f"/api/classes/{world.ee22.id}/attendance").status_code == 200


@pytest.mark.parametrize("role", ["other_teacher", "umea_teacher"])
def test_other_teachers_get_404(client: TestClient, login: Login, world: World, role: str) -> None:
    login(getattr(world, role))
    assert client.get(f"/api/classes/{world.ee22.id}/attendance").status_code == 404


def test_students_cannot_see_class_attendance(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.student)
    assert client.get(f"/api/classes/{world.ee22.id}/attendance").status_code == 403


# --- Handledaren ---------------------------------------------------------------------------


def test_supervisor_sees_todays_check_ins(
    client: TestClient, login: Login, world: World, db: Session
) -> None:
    add(db, world.placement, TODAY, AttendanceStatus.PRESENT)
    login(world.supervisor)
    body = client.get("/api/supervisor/attendance").json()
    statuses = {r["student"]["id"]: r["status"] for r in body}
    assert statuses == {str(world.student.id): "present", str(world.second.id): None}
    assert body[0]["workplace_name"] == "Elbolaget"


def test_supervisor_sees_other_day(
    client: TestClient, login: Login, world: World, db: Session
) -> None:
    add(db, world.placement, date(2026, 10, 20), AttendanceStatus.PRESENT)
    login(world.supervisor)
    body = client.get("/api/supervisor/attendance", params={"date": "2026-10-20"}).json()
    hugo = next(r for r in body if r["student"]["id"] == str(world.student.id))
    assert hugo["status"] == "present"


def test_other_supervisor_sees_nothing(client: TestClient, login: Login, world: World) -> None:
    login(world.other_supervisor)
    assert client.get("/api/supervisor/attendance").json() == []


def test_teacher_cannot_use_supervisor_endpoint(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.teacher)
    assert client.get("/api/supervisor/attendance").status_code == 403


# --- Placering med närvaro ------------------------------------------------------------------


def test_placement_with_attendance_cannot_be_deleted(
    client: TestClient, login: Login, world: World, db: Session
) -> None:
    add(db, world.placement, TODAY, AttendanceStatus.PRESENT)
    login(world.teacher)
    response = client.delete(f"/api/placements/{world.placement.id}")
    assert response.status_code == 409
