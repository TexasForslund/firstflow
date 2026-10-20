"""Elevregistret: skoladmin lägger in elever och väljer lärare, läraren ser sina elever."""

from collections.abc import Callable
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.school import School
from app.models.school_class import SchoolClass, teacher_students
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]


@dataclass
class School2:
    kramfors: School
    umea: School
    admin: User
    ingrid: User
    per: User
    umea_teacher: User
    hugo: User  # kopplad till Ingrid
    elsa: User  # inte kopplad till någon
    ee22: SchoolClass  # Ingrids klass


@pytest.fixture
def w(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> School2:
    kramfors, umea = make_school("Kramforsskolan"), make_school("Umeåskolan")
    admin = make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors)
    ingrid = make_user(email="ingrid@kramfors.se", role=UserRole.TEACHER, in_school=kramfors)
    per = make_user(email="per@kramfors.se", role=UserRole.TEACHER, in_school=kramfors)
    umea_teacher = make_user(email="anders@umea.se", role=UserRole.TEACHER, in_school=umea)
    hugo = make_user(email="hugo@kramfors.se", role=UserRole.STUDENT, in_school=kramfors)
    elsa = make_user(email="elsa@kramfors.se", role=UserRole.STUDENT, in_school=kramfors)
    hugo.name, elsa.name = "Hugo Karlsson", "Elsa Lindqvist"
    ee22 = SchoolClass(school_id=kramfors.id, name="EE22", teachers=[ingrid])
    db.add(ee22)
    db.flush()
    db.execute(teacher_students.insert().values(teacher_id=ingrid.id, student_id=hugo.id))
    db.flush()
    return School2(kramfors, umea, admin, ingrid, per, umea_teacher, hugo, elsa, ee22)


def test_teacher_lists_only_own_students(client: TestClient, login: Login, w: School2) -> None:
    login(w.ingrid)
    body = client.get("/api/students").json()
    assert [s["name"] for s in body] == ["Hugo Karlsson"]
    assert body[0]["teachers"] == [{"id": str(w.ingrid.id), "name": "Testperson"}]


def test_teacher_without_students_sees_none(client: TestClient, login: Login, w: School2) -> None:
    login(w.per)
    assert client.get("/api/students").json() == []


@pytest.mark.parametrize("role", [UserRole.SCHOOL_ADMIN, UserRole.PRINCIPAL, UserRole.SYV])
def test_school_staff_list_all_students(
    client: TestClient, login: Login, make_user: MakeUser, w: School2, role: UserRole
) -> None:
    login(make_user(email=f"{role}@kramfors.se", role=role, in_school=w.kramfors))
    names = [s["name"] for s in client.get("/api/students").json()]
    assert names == ["Elsa Lindqvist", "Hugo Karlsson"]


def test_search_by_name_or_email(client: TestClient, login: Login, w: School2) -> None:
    login(w.admin)
    assert [s["name"] for s in client.get("/api/students", params={"q": "els"}).json()] == [
        "Elsa Lindqvist"
    ]
    assert [s["name"] for s in client.get("/api/students", params={"q": "HUGO@"}).json()] == [
        "Hugo Karlsson"
    ]
    assert client.get("/api/students", params={"q": "%"}).json() == []  # inget jokertecken


def test_other_school_students_are_never_listed(
    client: TestClient, login: Login, make_user: MakeUser, w: School2
) -> None:
    make_user(email="elev@umea.se", role=UserRole.STUDENT, in_school=w.umea)
    login(w.admin)
    emails = {s["email"] for s in client.get("/api/students").json()}
    assert "elev@umea.se" not in emails


@pytest.mark.parametrize("role", [UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.SUPERADMIN])
def test_others_cannot_list_students(
    client: TestClient, login: Login, make_user: MakeUser, w: School2, role: UserRole
) -> None:
    login(make_user(email=f"{role}@x.se", role=role, in_school=w.kramfors))
    assert client.get("/api/students").status_code == 403


def test_admin_creates_student_with_teacher_and_class(
    client: TestClient, login: Login, w: School2
) -> None:
    login(w.admin)
    response = client.post(
        "/api/students",
        json={
            "name": " Nova Holm ",
            "email": "Nova@Kramfors.se",
            "teacher_ids": [str(w.ingrid.id), str(w.per.id)],
            "class_ids": [str(w.ee22.id)],
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Nova Holm"
    assert body["email"] == "nova@kramfors.se"
    assert body["school_name"] == "Kramforsskolan"
    assert {t["id"] for t in body["teachers"]} == {str(w.ingrid.id), str(w.per.id)}
    assert body["classes"] == [{"id": str(w.ee22.id), "name": "EE22"}]

    # Läraren får eleven i sin lista och kan välja hen
    login(w.per)
    assert "nova@kramfors.se" in {s["email"] for s in client.get("/api/students").json()}


def test_admin_creates_student_without_teacher(
    client: TestClient, login: Login, w: School2
) -> None:
    login(w.admin)
    response = client.post("/api/students", json={"name": "Ny", "email": "ny@kramfors.se"})
    assert response.status_code == 201
    assert response.json()["teachers"] == []


@pytest.mark.parametrize("field", ["teacher_ids", "class_ids"])
def test_create_student_rejects_other_school_teacher_or_class(
    client: TestClient, db: Session, login: Login, w: School2, field: str
) -> None:
    umea_class = SchoolClass(school_id=w.umea.id, name="X1")
    db.add(umea_class)
    db.flush()
    other = w.umea_teacher.id if field == "teacher_ids" else umea_class.id
    login(w.admin)
    response = client.post(
        "/api/students", json={"name": "Ny", "email": "ny@kramfors.se", field: [str(other)]}
    )
    assert response.status_code == 422
    assert client.get("/api/students", params={"q": "ny@"}).json() == []  # inget skapades


def test_create_student_rejects_non_teacher_as_teacher(
    client: TestClient, login: Login, w: School2
) -> None:
    login(w.admin)
    response = client.post(
        "/api/students",
        json={"name": "Ny", "email": "ny@kramfors.se", "teacher_ids": [str(w.hugo.id)]},
    )
    assert response.status_code == 422


def test_create_student_with_taken_email(client: TestClient, login: Login, w: School2) -> None:
    login(w.admin)
    response = client.post("/api/students", json={"name": "X", "email": "hugo@kramfors.se"})
    assert response.status_code == 409


@pytest.mark.parametrize("role", [UserRole.TEACHER, UserRole.PRINCIPAL, UserRole.SYV])
def test_only_school_admin_creates_students(
    client: TestClient, login: Login, make_user: MakeUser, w: School2, role: UserRole
) -> None:
    login(make_user(email=f"{role}2@kramfors.se", role=role, in_school=w.kramfors))
    response = client.post("/api/students", json={"name": "X", "email": "x@kramfors.se"})
    assert response.status_code == 403


def test_admin_sets_teachers(client: TestClient, login: Login, w: School2) -> None:
    login(w.admin)
    url = f"/api/students/{w.hugo.id}/teachers"
    body = client.put(url, json={"teacher_ids": [str(w.per.id)]}).json()
    assert [t["id"] for t in body["teachers"]] == [str(w.per.id)]

    login(w.ingrid)
    assert client.get("/api/students").json() == []  # Ingrid har inte längre Hugo

    login(w.admin)
    assert client.put(url, json={"teacher_ids": []}).json()["teachers"] == []


def test_set_teachers_rejects_other_school(client: TestClient, login: Login, w: School2) -> None:
    login(w.admin)
    response = client.put(
        f"/api/students/{w.hugo.id}/teachers", json={"teacher_ids": [str(w.umea_teacher.id)]}
    )
    assert response.status_code == 422


def test_set_teachers_on_other_school_student_is_not_found(
    client: TestClient, login: Login, make_user: MakeUser, w: School2
) -> None:
    umea_student = make_user(email="elev@umea.se", role=UserRole.STUDENT, in_school=w.umea)
    login(w.admin)
    response = client.put(f"/api/students/{umea_student.id}/teachers", json={"teacher_ids": []})
    assert response.status_code == 404


def test_teacher_cannot_set_teachers(client: TestClient, login: Login, w: School2) -> None:
    login(w.ingrid)
    response = client.put(f"/api/students/{w.hugo.id}/teachers", json={"teacher_ids": []})
    assert response.status_code == 403


def test_teacher_sees_linked_student_page(client: TestClient, login: Login, w: School2) -> None:
    login(w.ingrid)
    assert client.get(f"/api/students/{w.hugo.id}").status_code == 200
    assert client.get(f"/api/students/{w.elsa.id}").status_code == 404


# ─── Efter granskning ──────────────────────────────────────────


def test_superadmin_cannot_list_or_create(
    client: TestClient, login: Login, make_user: MakeUser, w: School2
) -> None:
    login(make_user(email="sa@firstflow.se", role=UserRole.SUPERADMIN))
    assert client.get("/api/students").status_code == 403
    response = client.post("/api/students", json={"name": "X", "email": "x@kramfors.se"})
    assert response.status_code == 403
    assert client.get(f"/api/students/{w.hugo.id}").status_code == 200


def test_inactive_teacher_is_rejected_and_duplicates_are_fine(
    client: TestClient, db: Session, login: Login, w: School2
) -> None:
    w.per.is_active = False
    db.flush()
    login(w.admin)
    inactive = {"name": "X", "email": "x@kramfors.se", "teacher_ids": [str(w.per.id)]}
    assert client.post("/api/students", json=inactive).status_code == 422
    twice = [str(w.ingrid.id), str(w.ingrid.id)]
    response = client.post(
        "/api/students", json={"name": "Y", "email": "y@kramfors.se", "teacher_ids": twice}
    )
    assert response.status_code == 201
    assert len(response.json()["teachers"]) == 1
    url = f"/api/students/{w.hugo.id}/teachers"
    assert client.put(url, json={"teacher_ids": twice}).status_code == 200


def test_create_student_rejects_student_id_as_class(
    client: TestClient, login: Login, w: School2
) -> None:
    login(w.admin)
    response = client.post(
        "/api/students",
        json={"name": "X", "email": "x@kramfors.se", "class_ids": [str(w.hugo.id)]},
    )
    assert response.status_code == 422


def test_teacher_neither_linked_nor_teaching_gets_404(
    client: TestClient, login: Login, w: School2
) -> None:
    login(w.per)
    assert client.get(f"/api/students/{w.hugo.id}").status_code == 404


@pytest.mark.parametrize("role", [UserRole.PRINCIPAL, UserRole.SYV, UserRole.STUDENT])
def test_only_admin_sets_teachers(
    client: TestClient, login: Login, make_user: MakeUser, w: School2, role: UserRole
) -> None:
    login(make_user(email=f"{role}3@kramfors.se", role=role, in_school=w.kramfors))
    response = client.put(f"/api/students/{w.hugo.id}/teachers", json={"teacher_ids": []})
    assert response.status_code == 403


def test_teacher_from_other_school_is_not_shown(
    client: TestClient, db: Session, login: Login, w: School2
) -> None:
    """En koppling till en lärare på en annan skola (t.ex. efter skolbyte) syns inte."""
    db.execute(teacher_students.insert().values(teacher_id=w.umea_teacher.id, student_id=w.hugo.id))
    db.flush()
    login(w.admin)
    teachers = client.get(f"/api/students/{w.hugo.id}").json()["teachers"]
    assert [t["id"] for t in teachers] == [str(w.ingrid.id)]
