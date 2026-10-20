from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.school import School
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]


@pytest.fixture
def as_superadmin(make_user: MakeUser, login: Login) -> User:
    user = make_user(email="admin@firstflow.se", role=UserRole.SUPERADMIN)
    login(user)
    return user


def test_create_and_list_schools(client: TestClient, as_superadmin: User) -> None:
    response = client.post(
        "/api/superadmin/schools", json={"name": "  Kramforsskolan ", "org_number": "212000-2411"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Kramforsskolan"
    assert body["org_number"] == "212000-2411"
    assert body["is_active"] is True

    names = [s["name"] for s in client.get("/api/superadmin/schools").json()]
    assert names == sorted(names)
    assert "Kramforsskolan" in names


def test_create_school_rejects_empty_name(client: TestClient, as_superadmin: User) -> None:
    assert client.post("/api/superadmin/schools", json={"name": ""}).status_code == 422


def test_create_school_admin(client: TestClient, as_superadmin: User, school: School) -> None:
    response = client.post(
        f"/api/superadmin/schools/{school.id}/admins",
        json={"email": " Lena@Kramfors.SE ", "name": "Lena Holmberg"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "lena@kramfors.se"
    assert body["role"] == "school_admin"
    assert body["school_id"] == str(school.id)
    assert body["school_name"] == school.name


def test_created_admin_cannot_log_in_before_password_is_set(
    client: TestClient, as_superadmin: User, school: School
) -> None:
    client.post(
        f"/api/superadmin/schools/{school.id}/admins",
        json={"email": "lena@kramfors.se", "name": "Lena"},
    )
    for password in ["!", "", "demo-firstflow"]:
        response = client.post(
            "/api/auth/login", json={"email": "lena@kramfors.se", "password": password}
        )
        assert response.status_code == 401


def test_create_school_admin_for_unknown_school(client: TestClient, as_superadmin: User) -> None:
    response = client.post(
        "/api/superadmin/schools/00000000-0000-0000-0000-000000000000/admins",
        json={"email": "a@b.se", "name": "A"},
    )
    assert response.status_code == 404


def test_create_school_admin_with_taken_email(
    client: TestClient, as_superadmin: User, school: School, make_user: MakeUser
) -> None:
    make_user(email="upptagen@skola.se")
    response = client.post(
        f"/api/superadmin/schools/{school.id}/admins",
        json={"email": "upptagen@skola.se", "name": "A"},
    )
    assert response.status_code == 409


def test_create_school_admin_rejects_invalid_email(
    client: TestClient, as_superadmin: User, school: School
) -> None:
    for email in ["inte-en-adress", "a@b", "@skola.se"]:
        response = client.post(
            f"/api/superadmin/schools/{school.id}/admins", json={"email": email, "name": "A"}
        )
        assert response.status_code == 422, email


@pytest.mark.parametrize("role", [r for r in UserRole if r != UserRole.SUPERADMIN])
def test_superadmin_endpoints_reject_other_roles(
    client: TestClient, make_user: MakeUser, login: Login, school: School, role: UserRole
) -> None:
    login(make_user(email=f"{role}@skola.se", role=role))
    assert client.get("/api/superadmin/schools").status_code == 403
    assert client.post("/api/superadmin/schools", json={"name": "X"}).status_code == 403
    response = client.post(
        f"/api/superadmin/schools/{school.id}/admins", json={"email": "a@b.se", "name": "A"}
    )
    assert response.status_code == 403


def test_superadmin_endpoints_require_login(client: TestClient) -> None:
    assert client.get("/api/superadmin/schools").status_code == 401


def test_database_rejects_school_mismatch(db: Session, school: School) -> None:
    """Villkoret i databasen: superadmin och handledare utan skola, alla andra med."""
    for role, school_id in [
        (UserRole.TEACHER, None),
        (UserRole.SUPERADMIN, school.id),
        (UserRole.SUPERVISOR, school.id),
    ]:
        savepoint = db.begin_nested()
        db.add(
            User(email=f"{role}@x.se", name="X", role=role, school_id=school_id, password_hash="!")
        )
        with pytest.raises(IntegrityError):
            db.flush()
        savepoint.rollback()
