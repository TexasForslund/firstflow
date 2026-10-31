"""Närvaro och incheckning (B4)."""

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.attendance import Attendance, AttendanceStatus
from app.models.invitation import Notification
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
    assert response.json()["detail"] == "I dag är ingen APL-dag för din klass"


def test_weekend_apl_days(client: TestClient, login: Login, world: World, db: Session) -> None:
    """Vuxenutbildning kan ha APL på helger (Texas, 2026-10-30)."""
    world.ee22.apl_weekdays = [4, 5, 6]
    db.flush()
    login(world.student)
    with patch("app.core.time.today", return_value=date(2026, 10, 24)):  # lördag
        assert client.post("/api/attendance/check-in").status_code == 200
    with patch("app.core.time.today", return_value=date(2026, 10, 21)):  # onsdag
        response = client.post("/api/attendance/check-in")
    assert response.status_code == 422


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


def test_class_attendance_uses_apl_weekdays(
    client: TestClient, login: Login, world: World, db: Session
) -> None:
    world.ee22.apl_weekdays = [0, 1, 2]
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


# --- Bekräftad närvaro (Texas, 2026-10-29) ---------------------------------------------------

MONDAY = date(2026, 10, 19)
TUESDAY = date(2026, 10, 20)


def _check_in(db: Session, placement: Placement, day: date, review: str | None = None) -> None:
    db.add(
        Attendance(
            placement_id=placement.id,
            date=day,
            status=AttendanceStatus.PRESENT,
            checked_in_at=datetime.combine(day, datetime.min.time(), UTC) + timedelta(hours=7),
            review=review,
        )
    )
    db.flush()


def test_check_in_waits_for_supervisor(
    client: TestClient, login: Login, world: World, db: Session
) -> None:
    login(world.student)
    day = client.post("/api/attendance/check-in").json()
    assert day["state"] == "pending"

    login(world.supervisor)
    listed = client.get("/api/supervisor/attendance/review").json()
    assert listed["earliest"] == "2026-10-08"
    today = {i["student"]["id"]: i for i in listed["today_items"]}
    assert today[str(world.student.id)]["state"] == "pending"
    assert today[str(world.second.id)]["state"] == "missing"
    # Måndag och tisdag i veckan saknar incheckning och går att lägga till.
    assert {(i["student"]["id"], i["date"]) for i in listed["earlier"]} >= {
        (str(world.student.id), "2026-10-19"),
        (str(world.second.id), "2026-10-20"),
    }

    body = {
        "items": [
            {"placement_id": str(world.placement.id), "date": "2026-10-21", "verdict": "confirmed"},
            # Eleven glömde att checka in i måndags.
            {"placement_id": str(world.placement.id), "date": "2026-10-19", "verdict": "confirmed"},
        ]
    }
    after = client.post("/api/supervisor/attendance/review", json=body).json()
    today = {i["student"]["id"]: i for i in after["today_items"]}
    assert today[str(world.student.id)]["state"] == "confirmed"
    added = db.scalar(
        select(Attendance).where(
            Attendance.placement_id == world.placement.id, Attendance.date == MONDAY
        )
    )
    assert added is not None and added.checked_in_at is None
    assert added.status == AttendanceStatus.PRESENT and added.reviewed_by_id == world.supervisor.id

    login(world.teacher)
    rows = client.get(f"/api/classes/{world.ee22.id}/attendance").json()["students"]
    hugo = next(r for r in rows if r["student"]["id"] == str(world.student.id))
    assert hugo["present"] == 2 and hugo["pending"] == 0 and hugo["today_state"] == "confirmed"


def test_not_present_does_not_count(
    client: TestClient, login: Login, world: World, db: Session
) -> None:
    _check_in(db, world.placement, TUESDAY)
    login(world.supervisor)
    body = {
        "items": [
            {
                "placement_id": str(world.placement.id),
                "date": "2026-10-20",
                "verdict": "not_present",
            }
        ]
    }
    assert client.post("/api/supervisor/attendance/review", json=body).status_code == 200

    login(world.teacher)
    rows = client.get(f"/api/classes/{world.ee22.id}/attendance").json()["students"]
    hugo = next(r for r in rows if r["student"]["id"] == str(world.student.id))
    assert hugo["present"] == 0 and hugo["not_present"] == 1

    week = client.get(f"/api/classes/{world.ee22.id}/attendance/week").json()
    assert week["days"][0] == "2026-10-19"
    row = next(s for s in week["students"] if s["student"]["id"] == str(world.student.id))
    assert [d["state"] for d in row["days"]][:3] == ["missing", "not_present", "missing"]
    assert row["days"][1]["checked_in_at"] is not None


def test_review_list_this_week(client: TestClient, login: Login, world: World, db: Session) -> None:
    """Veckans dagar före i dag i alla lägen, för listorna Ingen incheckning och Klart."""
    _check_in(db, world.placement, MONDAY, review="confirmed")
    _check_in(db, world.placement, TUESDAY)
    login(world.supervisor)
    listed = client.get("/api/supervisor/attendance/review").json()
    week = {(i["student"]["id"], i["date"]): i["state"] for i in listed["this_week"]}
    assert week[(str(world.student.id), "2026-10-19")] == "confirmed"
    assert week[(str(world.student.id), "2026-10-20")] == "pending"
    assert week[(str(world.second.id), "2026-10-20")] == "missing"
    # I dag och förra veckan är inte med.
    assert all("2026-10-19" <= d < "2026-10-21" for _, d in week)
    assert [i["date"] for i in listed["this_week"]] == sorted(
        (i["date"] for i in listed["this_week"]), reverse=True
    )
    # Bekräftade dagar väntar inte.
    assert (str(world.student.id), "2026-10-19") not in {
        (i["student"]["id"], i["date"]) for i in listed["earlier"]
    }


def test_review_rules(client: TestClient, login: Login, world: World) -> None:
    login(world.supervisor)

    def send(day: str, placement: Placement | None = None) -> int:
        item = {"placement_id": str((placement or world.placement).id), "date": day}
        body = {"items": [{**item, "verdict": "confirmed"}]}
        return client.post("/api/supervisor/attendance/review", json=body).status_code

    assert send("2026-10-12") == 200  # placeringens första dag, inom två veckor
    assert send("2026-10-09") == 422  # före placeringen
    assert send("2026-10-22") == 422  # framtiden
    assert send("2026-10-18") == 422  # söndag

    # Längre bakåt än två veckor går inte, även inom placeringen.
    with patch("app.core.time.today", return_value=date(2026, 11, 3)):
        assert send("2026-10-21") == 200  # 14 dagar bakåt, i dag inräknad
        assert send("2026-10-20") == 422

    # En annan handledare kan inte bekräfta.
    login(world.other_supervisor)
    assert send("2026-10-21") == 404


def test_week_and_reminder(client: TestClient, login: Login, world: World, db: Session) -> None:
    _check_in(db, world.placement, MONDAY)
    _check_in(db, world.placement, TUESDAY, review="confirmed")
    login(world.teacher)
    week = client.get(f"/api/classes/{world.ee22.id}/attendance/week?start=2026-10-23").json()
    assert week["week_start"] == "2026-10-19"
    assert week["waiting"] == [
        {"supervisor": {"id": str(world.supervisor.id), "name": world.supervisor.name}, "count": 1}
    ]
    unplaced = next(s for s in week["students"] if s["student"]["id"] == str(world.unplaced.id))
    assert unplaced["supervisor"] is None and not any(d["on_apl"] for d in unplaced["days"])

    assert client.post(f"/api/classes/{world.ee22.id}/attendance/remind").json() == {"reminded": 1}
    note = db.scalar(select(Notification).where(Notification.user_id == world.supervisor.id))
    assert note is not None and note.link == "/attendance-review"

    # Bara läraren påminner.
    login(world.admin)
    assert client.post(f"/api/classes/{world.ee22.id}/attendance/remind").status_code == 403
