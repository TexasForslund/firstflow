"""Klasser: lärare ser bara sina klasser, ingen ser andra skolors."""

from collections.abc import Callable
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.school import School
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]


@dataclass
class World:
    kramfors: School
    umea: School
    teacher: User  # har EE22 på Kramfors
    other_teacher: User  # Kramfors, har ingen klass
    umea_teacher: User
    admin: User  # skoladmin Kramfors
    principal: User
    student: User  # i EE22
    ee22: SchoolClass
    umea_class: SchoolClass


@pytest.fixture
def world(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> World:
    kramfors, umea = make_school("Kramforsskolan"), make_school("Umeåskolan")
    teacher = make_user(email="ingrid@kramfors.se", role=UserRole.TEACHER, in_school=kramfors)
    other = make_user(email="per@kramfors.se", role=UserRole.TEACHER, in_school=kramfors)
    umea_teacher = make_user(email="anders@umea.se", role=UserRole.TEACHER, in_school=umea)
    admin = make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors)
    principal = make_user(email="rektor@kramfors.se", role=UserRole.PRINCIPAL, in_school=kramfors)
    student = make_user(email="hugo@kramfors.se", role=UserRole.STUDENT, in_school=kramfors)
    ee22 = SchoolClass(school_id=kramfors.id, name="EE22", teachers=[teacher], students=[student])
    umea_class = SchoolClass(school_id=umea.id, name="EE22", teachers=[umea_teacher])
    db.add_all([ee22, umea_class])
    db.flush()
    return World(
        kramfors, umea, teacher, other, umea_teacher, admin, principal, student, ee22, umea_class
    )


def test_teacher_lists_own_classes(client: TestClient, login: Login, world: World) -> None:
    login(world.teacher)
    assert client.get("/api/classes").json() == [
        {
            "id": str(world.ee22.id),
            "name": "EE22",
            "student_count": 1,
            "teacher_names": ["Testperson"],
        }
    ]


def test_teacher_without_classes_sees_none(client: TestClient, login: Login, world: World) -> None:
    login(world.other_teacher)
    assert client.get("/api/classes").json() == []


@pytest.mark.parametrize("who", ["admin", "principal"])
def test_school_staff_list_all_classes_of_own_school(
    client: TestClient, login: Login, world: World, who: str
) -> None:
    login(getattr(world, who))
    ids = {c["id"] for c in client.get("/api/classes").json()}
    assert ids == {str(world.ee22.id)}


def test_teacher_creates_class_and_is_linked(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.other_teacher)
    response = client.post("/api/classes", json={"name": "  EE23 "})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "EE23"
    assert body["school_id"] == str(world.kramfors.id)
    assert [t["id"] for t in body["teachers"]] == [str(world.other_teacher.id)]
    assert [c["name"] for c in client.get("/api/classes").json()] == ["EE23"]


def test_school_admin_creates_class_without_teacher(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.admin)
    body = client.post("/api/classes", json={"name": "EE23"}).json()
    assert body["teachers"] == []


def test_duplicate_class_name_in_same_school(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.other_teacher)
    assert client.post("/api/classes", json={"name": "EE22"}).status_code == 409


def test_same_class_name_in_other_school_is_fine(
    client: TestClient, login: Login, world: World
) -> None:
    # Umeåskolan har också en EE22. Kramfors kan skapa sin egen EE21 utan krock.
    login(world.admin)
    assert client.post("/api/classes", json={"name": "EE21"}).status_code == 201


@pytest.mark.parametrize("who", ["teacher", "admin", "principal"])
def test_get_class(client: TestClient, login: Login, world: World, who: str) -> None:
    login(getattr(world, who))
    body = client.get(f"/api/classes/{world.ee22.id}").json()
    assert body["name"] == "EE22"
    assert [s["email"] for s in body["students"]] == ["hugo@kramfors.se"]


@pytest.mark.parametrize("who", ["other_teacher", "umea_teacher"])
def test_class_of_someone_else_is_not_found(
    client: TestClient, login: Login, world: World, who: str
) -> None:
    """En annan lärares klass, på samma eller annan skola, svarar 404."""
    login(getattr(world, who))
    cid = world.ee22.id
    assert client.get(f"/api/classes/{cid}").status_code == 404
    response = client.post(f"/api/classes/{cid}/students", json={"email": "x@y.se", "name": "X"})
    assert response.status_code == 404
    assert client.delete(f"/api/classes/{cid}/students/{world.student.id}").status_code == 404


def test_school_admin_cannot_see_other_schools_class(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.admin)
    assert client.get(f"/api/classes/{world.umea_class.id}").status_code == 404
    unknown = client.get("/api/classes/00000000-0000-0000-0000-000000000000")
    assert unknown.status_code == 404


@pytest.mark.parametrize("role", [UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.SYV])
def test_other_roles_cannot_use_classes(
    client: TestClient, make_user: MakeUser, login: Login, world: World, role: UserRole
) -> None:
    login(make_user(email=f"{role}@kramfors.se", role=role, in_school=world.kramfors))
    assert client.get("/api/classes").status_code == 403
    assert client.get(f"/api/classes/{world.ee22.id}").status_code == 403
    assert client.post("/api/classes", json={"name": "X"}).status_code == 403


def test_classes_require_login(client: TestClient) -> None:
    assert client.get("/api/classes").status_code == 401


def test_add_new_student(client: TestClient, login: Login, world: World) -> None:
    login(world.teacher)
    response = client.post(
        f"/api/classes/{world.ee22.id}/students",
        json={"email": "Elsa@Kramfors.se", "name": "Elsa Lindqvist"},
    )
    assert response.status_code == 201
    assert response.json()["email"] == "elsa@kramfors.se"
    students = client.get(f"/api/classes/{world.ee22.id}").json()["students"]
    assert [s["name"] for s in students] == ["Elsa Lindqvist", "Testperson"]


def test_add_existing_student_of_same_school_links_it(
    client: TestClient, db: Session, login: Login, make_user: MakeUser, world: World
) -> None:
    existing = make_user(email="omar@kramfors.se", role=UserRole.STUDENT, in_school=world.kramfors)
    login(world.teacher)
    response = client.post(
        f"/api/classes/{world.ee22.id}/students", json={"email": "omar@kramfors.se", "name": "X"}
    )
    assert response.status_code == 201
    assert response.json()["id"] == str(existing.id)
    # Två gånger ger ingen dubblett
    client.post(
        f"/api/classes/{world.ee22.id}/students", json={"email": "omar@kramfors.se", "name": "X"}
    )
    assert client.get("/api/classes").json()[0]["student_count"] == 2


@pytest.mark.parametrize("email", ["anders@umea.se", "per@kramfors.se"])
def test_add_student_with_email_of_other_account(
    client: TestClient, login: Login, world: World, email: str
) -> None:
    """En lärare eller en elev på en annan skola kan inte kopplas som elev."""
    login(world.teacher)
    response = client.post(
        f"/api/classes/{world.ee22.id}/students", json={"email": email, "name": "X"}
    )
    assert response.status_code == 409


def test_principal_cannot_change_class(client: TestClient, login: Login, world: World) -> None:
    login(world.principal)
    response = client.post(
        f"/api/classes/{world.ee22.id}/students", json={"email": "ny@kramfors.se", "name": "Ny"}
    )
    assert response.status_code == 403


def test_remove_student_keeps_account(
    client: TestClient, db: Session, login: Login, world: World
) -> None:
    login(world.teacher)
    url = f"/api/classes/{world.ee22.id}/students/{world.student.id}"
    assert client.delete(url).status_code == 204
    assert client.get(f"/api/classes/{world.ee22.id}").json()["students"] == []
    assert db.get(User, world.student.id) is not None
    assert client.delete(url).status_code == 404


def test_school_admin_assigns_and_unassigns_teacher(
    client: TestClient, login: Login, world: World
) -> None:
    login(world.admin)
    url = f"/api/classes/{world.ee22.id}/teachers"
    assert client.post(url, json={"teacher_id": str(world.other_teacher.id)}).status_code == 201
    teachers = client.get(f"/api/classes/{world.ee22.id}").json()["teachers"]
    assert {t["email"] for t in teachers} == {"ingrid@kramfors.se", "per@kramfors.se"}
    assert client.delete(f"{url}/{world.other_teacher.id}").status_code == 204
    assert client.delete(f"{url}/{world.other_teacher.id}").status_code == 404


@pytest.mark.parametrize("who", ["umea_teacher", "student"])
def test_cannot_assign_teacher_from_other_school_or_non_teacher(
    client: TestClient, login: Login, world: World, who: str
) -> None:
    login(world.admin)
    response = client.post(
        f"/api/classes/{world.ee22.id}/teachers", json={"teacher_id": str(getattr(world, who).id)}
    )
    assert response.status_code == 404


def test_teacher_cannot_assign_teachers(client: TestClient, login: Login, world: World) -> None:
    login(world.teacher)
    response = client.post(
        f"/api/classes/{world.ee22.id}/teachers", json={"teacher_id": str(world.other_teacher.id)}
    )
    assert response.status_code == 403


def test_superadmin_sees_every_class(
    client: TestClient, login: Login, make_user: MakeUser, world: World
) -> None:
    login(make_user(email="sa@firstflow.se", role=UserRole.SUPERADMIN))
    assert len(client.get("/api/classes").json()) == 2
    assert client.get(f"/api/classes/{world.umea_class.id}").status_code == 200
    assert client.post("/api/classes", json={"name": "X"}).status_code == 403


# ─── Elevsidan ─────────────────────────────────────────────────


def test_teacher_sees_own_student(client: TestClient, login: Login, world: World) -> None:
    login(world.teacher)
    body = client.get(f"/api/students/{world.student.id}").json()
    assert body["email"] == "hugo@kramfors.se"
    assert body["school_name"] == "Kramforsskolan"
    assert body["classes"] == [{"id": str(world.ee22.id), "name": "EE22"}]


@pytest.mark.parametrize("who", ["other_teacher", "umea_teacher"])
def test_teacher_cannot_see_student_outside_own_classes(
    client: TestClient, login: Login, world: World, who: str
) -> None:
    login(getattr(world, who))
    assert client.get(f"/api/students/{world.student.id}").status_code == 404


@pytest.mark.parametrize("role", [UserRole.SCHOOL_ADMIN, UserRole.PRINCIPAL, UserRole.SYV])
def test_school_staff_see_students_of_own_school(
    client: TestClient, login: Login, make_user: MakeUser, world: World, role: UserRole
) -> None:
    login(make_user(email=f"{role}@kramfors.se", role=role, in_school=world.kramfors))
    assert client.get(f"/api/students/{world.student.id}").status_code == 200


def test_staff_of_other_school_cannot_see_student(
    client: TestClient, login: Login, make_user: MakeUser, world: World
) -> None:
    login(make_user(email="admin@umea.se", role=UserRole.SCHOOL_ADMIN, in_school=world.umea))
    assert client.get(f"/api/students/{world.student.id}").status_code == 404


def test_student_page_only_for_students(client: TestClient, login: Login, world: World) -> None:
    login(world.admin)
    assert client.get(f"/api/students/{world.teacher.id}").status_code == 404


@pytest.mark.parametrize("role", [UserRole.STUDENT, UserRole.SUPERVISOR])
def test_students_and_supervisors_cannot_open_student_page(
    client: TestClient, login: Login, make_user: MakeUser, world: World, role: UserRole
) -> None:
    login(make_user(email=f"{role}@x.se", role=role, in_school=world.kramfors))
    assert client.get(f"/api/students/{world.student.id}").status_code == 403
