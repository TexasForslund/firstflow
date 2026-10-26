"""Praktikplatser: arbetsplatser, handledare och placeringar (B3)."""

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.placement import Placement, Workplace
from app.models.school import School
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]

TODAY = date(2026, 10, 21)


@dataclass
class World:
    kramfors: School
    umea: School
    teacher: User  # har EE22 på Kramfors
    other_teacher: User  # Kramfors, har ingen klass
    umea_teacher: User
    admin: User
    principal: User
    student: User  # i EE22
    other_student: User  # Kramfors, ingen klass
    supervisor: User  # på Elbolaget
    other_supervisor: User  # på Umeå Bygg
    ee22: SchoolClass
    workplace: Workplace  # Elbolaget, Kramfors
    umea_workplace: Workplace


@pytest.fixture
def world(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> World:
    kramfors, umea = make_school("Kramforsskolan"), make_school("Umeåskolan")
    teacher = make_user(email="ingrid@kramfors.se", in_school=kramfors)
    other = make_user(email="per@kramfors.se", in_school=kramfors)
    umea_teacher = make_user(email="anders@umea.se", in_school=umea)
    admin = make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors)
    principal = make_user(email="rektor@kramfors.se", role=UserRole.PRINCIPAL, in_school=kramfors)
    student = make_user(email="hugo@kramfors.se", role=UserRole.STUDENT, in_school=kramfors)
    other_student = make_user(email="elsa@kramfors.se", role=UserRole.STUDENT, in_school=kramfors)
    supervisor = make_user(email="gustav@elbolaget.se", role=UserRole.SUPERVISOR)
    other_supervisor = make_user(email="lisa@umeabygg.se", role=UserRole.SUPERVISOR)
    ee22 = SchoolClass(school_id=kramfors.id, name="EE22", teachers=[teacher], students=[student])
    workplace = Workplace(school_id=kramfors.id, name="Elbolaget", supervisors=[supervisor])
    umea_workplace = Workplace(school_id=umea.id, name="Umeå Bygg", supervisors=[other_supervisor])
    db.add_all([ee22, workplace, umea_workplace])
    db.flush()
    return World(
        kramfors,
        umea,
        teacher,
        other,
        umea_teacher,
        admin,
        principal,
        student,
        other_student,
        supervisor,
        other_supervisor,
        ee22,
        workplace,
        umea_workplace,
    )


def place(
    db: Session,
    student: User,
    workplace: Workplace,
    supervisor: User,
    start: date = TODAY - timedelta(days=7),
    end: date = TODAY + timedelta(days=30),
) -> Placement:
    placement = Placement(
        student_id=student.id,
        workplace_id=workplace.id,
        supervisor_id=supervisor.id,
        start_date=start,
        end_date=end,
    )
    db.add(placement)
    db.flush()
    return placement


def placement_body(w: World, **changes: object) -> dict[str, object]:
    body: dict[str, object] = {
        "student_id": str(w.student.id),
        "workplace_id": str(w.workplace.id),
        "supervisor_id": str(w.supervisor.id),
        "start_date": "2026-11-02",
        "end_date": "2026-12-18",
    }
    body.update(changes)
    return body


@pytest.fixture(autouse=True)
def fixed_today() -> Iterator[None]:
    with patch("app.core.time.today", return_value=TODAY):
        yield


# Arbetsplatser


@pytest.mark.parametrize("who", ["teacher", "admin", "principal"])
def test_school_staff_list_own_schools_workplaces(
    client: TestClient, login: Login, world: World, who: str
) -> None:
    login(getattr(world, who))
    assert client.get("/api/workplaces").json() == [
        {
            "id": str(world.workplace.id),
            "name": "Elbolaget",
            "address": None,
            "industry": None,
            "description": None,
            "supervisors": [
                {
                    "id": str(world.supervisor.id),
                    "name": "Testperson",
                    "email": "gustav@elbolaget.se",
                }
            ],
        }
    ]


@pytest.mark.parametrize("role", [UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.SYV])
def test_other_roles_cannot_list_workplaces(
    client: TestClient, login: Login, make_user: MakeUser, world: World, role: UserRole
) -> None:
    login(make_user(email="x@x.se", role=role, in_school=world.kramfors))
    assert client.get("/api/workplaces").status_code == 403


def test_workplaces_require_login(client: TestClient) -> None:
    assert client.get("/api/workplaces").status_code == 401


def test_admin_creates_workplace(client: TestClient, login: Login, world: World) -> None:
    login(world.admin)
    response = client.post(
        "/api/workplaces", json={"name": "  Kramfors El  ", "address": " Storgatan 1 "}
    )
    assert response.status_code == 201
    assert response.json()["name"] == "Kramfors El"
    assert response.json()["address"] == "Storgatan 1"
    names = [w["name"] for w in client.get("/api/workplaces").json()]
    assert names == ["Elbolaget", "Kramfors El"]


@pytest.mark.parametrize("who", ["teacher", "principal"])
def test_only_admin_creates_workplace(
    client: TestClient, login: Login, world: World, who: str
) -> None:
    """Lärare skapar inte arbetsplatser själva. De bjuder in handledare (Texas, 2026-10-26)."""
    login(getattr(world, who))
    assert client.post("/api/workplaces", json={"name": "X"}).status_code == 403
    response = client.post(
        f"/api/workplaces/{world.workplace.id}/supervisors",
        json={"name": "Anna", "email": "anna@x.se"},
    )
    assert response.status_code == 403


def test_teacher_sees_only_own_and_shared_workplaces(
    client: TestClient, login: Login, world: World, db: Session
) -> None:
    world.workplace.owner_teacher_id = world.other_teacher.id
    db.flush()
    login(world.teacher)
    assert client.get("/api/workplaces").json() == []
    login(world.other_teacher)
    assert [w["name"] for w in client.get("/api/workplaces").json()] == ["Elbolaget"]
    login(world.admin)
    assert [w["name"] for w in client.get("/api/workplaces").json()] == ["Elbolaget"]


def test_blank_workplace_name_is_rejected(client: TestClient, login: Login, world: World) -> None:
    login(world.admin)
    assert client.post("/api/workplaces", json={"name": "   "}).status_code == 422


def test_admin_adds_new_supervisor(client: TestClient, login: Login, world: World) -> None:
    login(world.admin)
    response = client.post(
        f"/api/workplaces/{world.workplace.id}/supervisors",
        json={"name": "Anna Ek", "email": "Anna@Elbolaget.se"},
    )
    assert response.status_code == 201
    supervisors = response.json()["supervisors"]
    assert [s["email"] for s in supervisors] == ["anna@elbolaget.se", "gustav@elbolaget.se"]


def test_existing_supervisor_is_linked(
    client: TestClient, db: Session, login: Login, world: World
) -> None:
    """Samma handledare kan ta emot elever från flera skolor."""
    login(world.admin)
    response = client.post(
        f"/api/workplaces/{world.workplace.id}/supervisors",
        json={"name": "Annat namn", "email": "lisa@umeabygg.se"},
    )
    assert response.status_code == 201
    ids = [s["id"] for s in response.json()["supervisors"]]
    assert str(world.other_supervisor.id) in ids
    assert db.get(User, world.other_supervisor.id).name == "Testperson"


def test_supervisor_email_of_other_role_conflicts(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.admin)
    response = client.post(
        f"/api/workplaces/{world.workplace.id}/supervisors",
        json={"name": "Hugo", "email": "hugo@kramfors.se"},
    )
    assert response.status_code == 409


def test_other_schools_workplace_is_not_found(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.admin)
    response = client.post(
        f"/api/workplaces/{world.umea_workplace.id}/supervisors",
        json={"name": "Anna", "email": "anna@x.se"},
    )
    assert response.status_code == 404


# Placeringar


def test_teacher_places_student_in_own_class(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.teacher)
    response = client.post("/api/placements", json=placement_body(world))
    assert response.status_code == 201
    data = response.json()
    assert data["student"] == {"id": str(world.student.id), "name": "Testperson"}
    assert data["workplace"]["name"] == "Elbolaget"
    assert data["supervisor"]["id"] == str(world.supervisor.id)
    assert (data["start_date"], data["end_date"]) == ("2026-11-02", "2026-12-18")


def test_admin_places_any_student_on_school(client: TestClient, login: Login, world: World) -> None:
    login(world.admin)
    body = placement_body(world, student_id=str(world.other_student.id))
    assert client.post("/api/placements", json=body).status_code == 201


def test_teacher_cannot_place_student_outside_own_classes(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.teacher)
    body = placement_body(world, student_id=str(world.other_student.id))
    assert client.post("/api/placements", json=body).status_code == 404


def test_other_teacher_cannot_place_student(client: TestClient, login: Login, world: World) -> None:
    login(world.other_teacher)
    assert client.post("/api/placements", json=placement_body(world)).status_code == 404


def test_other_school_cannot_place_student(client: TestClient, login: Login, world: World) -> None:
    login(world.umea_teacher)
    body = placement_body(
        world,
        workplace_id=str(world.umea_workplace.id),
        supervisor_id=str(world.other_supervisor.id),
    )
    assert client.post("/api/placements", json=body).status_code == 404


def test_workplace_must_belong_to_school(client: TestClient, login: Login, world: World) -> None:
    login(world.teacher)
    body = placement_body(
        world,
        workplace_id=str(world.umea_workplace.id),
        supervisor_id=str(world.other_supervisor.id),
    )
    assert client.post("/api/placements", json=body).status_code == 404


def test_supervisor_must_be_on_workplace(client: TestClient, login: Login, world: World) -> None:
    login(world.teacher)
    body = placement_body(world, supervisor_id=str(world.other_supervisor.id))
    assert client.post("/api/placements", json=body).status_code == 422


def test_end_before_start_is_rejected(client: TestClient, login: Login, world: World) -> None:
    login(world.teacher)
    body = placement_body(world, start_date="2026-12-01", end_date="2026-11-01")
    assert client.post("/api/placements", json=body).status_code == 422


def test_overlapping_placement_conflicts(
    client: TestClient, db: Session, login: Login, world: World
) -> None:
    place(db, world.student, world.workplace, world.supervisor)  # t.o.m. 2026-11-20
    login(world.teacher)
    overlapping = placement_body(world, start_date="2026-11-20", end_date="2026-12-01")
    assert client.post("/api/placements", json=overlapping).status_code == 409
    after = placement_body(world, start_date="2026-11-21", end_date="2026-12-01")
    assert client.post("/api/placements", json=after).status_code == 201


@pytest.mark.parametrize("role", [UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.PRINCIPAL])
def test_other_roles_cannot_place(
    client: TestClient, login: Login, make_user: MakeUser, world: World, role: UserRole
) -> None:
    login(make_user(email="x@x.se", role=role, in_school=world.kramfors))
    assert client.post("/api/placements", json=placement_body(world)).status_code == 403


def test_placement_requires_login(client: TestClient, world: World) -> None:
    assert client.post("/api/placements", json=placement_body(world)).status_code == 401


def test_teacher_deletes_placement(
    client: TestClient, db: Session, login: Login, world: World
) -> None:
    placement = place(db, world.student, world.workplace, world.supervisor)
    login(world.teacher)
    assert client.delete(f"/api/placements/{placement.id}").status_code == 204
    assert client.get(f"/api/classes/{world.ee22.id}/placements").json() == []


def test_other_teacher_cannot_delete_placement(
    client: TestClient, db: Session, login: Login, world: World
) -> None:
    placement = place(db, world.student, world.workplace, world.supervisor)
    login(world.other_teacher)
    assert client.delete(f"/api/placements/{placement.id}").status_code == 404


# Klassens placeringar


@pytest.mark.parametrize("who", ["teacher", "admin", "principal"])
def test_class_placements(
    client: TestClient, db: Session, login: Login, world: World, who: str
) -> None:
    placement = place(db, world.student, world.workplace, world.supervisor)
    place(db, world.other_student, world.workplace, world.supervisor)  # inte i klassen
    login(getattr(world, who))
    data = client.get(f"/api/classes/{world.ee22.id}/placements").json()
    assert [p["id"] for p in data] == [str(placement.id)]
    assert data[0]["workplace"]["name"] == "Elbolaget"


def test_other_teacher_cannot_see_class_placements(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.other_teacher)
    assert client.get(f"/api/classes/{world.ee22.id}/placements").status_code == 404


def test_other_school_cannot_see_class_placements(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.umea_teacher)
    assert client.get(f"/api/classes/{world.ee22.id}/placements").status_code == 404


@pytest.mark.parametrize("role", [UserRole.STUDENT, UserRole.SUPERVISOR])
def test_student_and_supervisor_cannot_see_class_placements(
    client: TestClient, login: Login, make_user: MakeUser, world: World, role: UserRole
) -> None:
    login(make_user(email="x@x.se", role=role, in_school=world.kramfors))
    assert client.get(f"/api/classes/{world.ee22.id}/placements").status_code == 403


# Eleven


def test_student_sees_own_placements(
    client: TestClient, db: Session, login: Login, world: World
) -> None:
    place(db, world.student, world.workplace, world.supervisor)
    place(db, world.other_student, world.workplace, world.supervisor)
    login(world.student)
    data = client.get("/api/me/placements").json()
    assert len(data) == 1
    assert data[0]["workplace"]["name"] == "Elbolaget"
    assert data[0]["supervisor_name"] == "Testperson"
    assert "email" not in data[0]


def test_teacher_cannot_use_my_placements(client: TestClient, login: Login, world: World) -> None:
    login(world.teacher)
    assert client.get("/api/me/placements").status_code == 403


def test_my_placements_require_login(client: TestClient) -> None:
    assert client.get("/api/me/placements").status_code == 401


# Handledaren


def test_supervisor_sees_current_students(
    client: TestClient, db: Session, login: Login, world: World
) -> None:
    current = place(db, world.student, world.workplace, world.supervisor)
    # Avslutad placering för en annan elev syns inte.
    place(
        db,
        world.other_student,
        world.workplace,
        world.supervisor,
        start=TODAY - timedelta(days=60),
        end=TODAY - timedelta(days=1),
    )
    login(world.supervisor)
    data = client.get("/api/supervisor/students").json()
    assert data == [
        {
            "placement_id": str(current.id),
            "student": {"id": str(world.student.id), "name": "Testperson"},
            "workplace": {"id": str(world.workplace.id), "name": "Elbolaget", "address": None},
            "start_date": str(current.start_date),
            "end_date": str(current.end_date),
        }
    ]


def test_supervisor_does_not_see_other_supervisors_students(
    client: TestClient, db: Session, login: Login, world: World
) -> None:
    place(db, world.student, world.workplace, world.supervisor)
    login(world.other_supervisor)
    assert client.get("/api/supervisor/students").json() == []
    # Handledaren når inte eleven eller klassen via lärarnas endpoints heller.
    assert client.get(f"/api/students/{world.student.id}").status_code == 403
    assert client.get(f"/api/classes/{world.ee22.id}/placements").status_code == 403


def test_teacher_cannot_use_supervisor_students(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.teacher)
    assert client.get("/api/supervisor/students").status_code == 403


def test_supervisor_students_require_login(client: TestClient) -> None:
    assert client.get("/api/supervisor/students").status_code == 401
