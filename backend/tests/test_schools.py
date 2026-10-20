"""Tenantskydd: en skolas användare syns och skapas bara av den egna skolan."""

from collections.abc import Callable
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.school import School
from app.models.user import User, UserRole
from app.services.accounts import create_account
from tests.conftest import PASSWORD

MakeUser = Callable[..., User]
MakeSchool = Callable[..., School]
Login = Callable[[User], None]


@pytest.fixture
def two_schools(make_school: MakeSchool, make_user: MakeUser) -> tuple[School, School]:
    """Kramforsskolan och Umeåskolan, med en lärare och en elev var."""
    kramfors, umea = make_school("Kramforsskolan"), make_school("Umeåskolan")
    make_user(email="larare@kramfors.se", role=UserRole.TEACHER, in_school=kramfors)
    make_user(email="elev@kramfors.se", role=UserRole.STUDENT, in_school=kramfors)
    make_user(email="larare@umea.se", role=UserRole.TEACHER, in_school=umea)
    make_user(email="elev@umea.se", role=UserRole.STUDENT, in_school=umea)
    return kramfors, umea


@pytest.mark.parametrize("role", [UserRole.SCHOOL_ADMIN, UserRole.PRINCIPAL])
def test_lists_users_of_own_school(
    client: TestClient,
    make_user: MakeUser,
    login: Login,
    two_schools: tuple[School, School],
    role: UserRole,
) -> None:
    kramfors, _ = two_schools
    login(make_user(email="personal@kramfors.se", role=role, in_school=kramfors))

    response = client.get(f"/api/schools/{kramfors.id}/users")
    assert response.status_code == 200
    emails = {u["email"] for u in response.json()}
    assert emails == {"larare@kramfors.se", "elev@kramfors.se", "personal@kramfors.se"}
    assert all(u["school_name"] == "Kramforsskolan" for u in response.json())


def test_filters_users_by_role(
    client: TestClient, make_user: MakeUser, login: Login, two_schools: tuple[School, School]
) -> None:
    kramfors, _ = two_schools
    login(make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors))
    response = client.get(f"/api/schools/{kramfors.id}/users", params={"role": "student"})
    assert [u["email"] for u in response.json()] == ["elev@kramfors.se"]


@pytest.mark.parametrize("role", [UserRole.SCHOOL_ADMIN, UserRole.PRINCIPAL])
def test_other_school_is_not_found(
    client: TestClient,
    make_user: MakeUser,
    login: Login,
    two_schools: tuple[School, School],
    role: UserRole,
) -> None:
    """Personal på Kramforsskolan får 404, inte 403, för Umeåskolans data."""
    kramfors, umea = two_schools
    login(make_user(email="personal@kramfors.se", role=role, in_school=kramfors))

    assert client.get(f"/api/schools/{umea.id}/users").status_code == 404
    response = client.post(
        f"/api/schools/{umea.id}/users",
        json={"email": "ny@umea.se", "name": "Ny", "role": "teacher"},
    )
    assert response.status_code in (403, 404)  # rektor har inte rätt att skapa alls


def test_unknown_school_looks_the_same_as_other_school(
    client: TestClient, make_user: MakeUser, login: Login, two_schools: tuple[School, School]
) -> None:
    kramfors, umea = two_schools
    login(make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors))
    other = client.get(f"/api/schools/{umea.id}/users")
    unknown = client.get("/api/schools/00000000-0000-0000-0000-000000000000/users")
    assert other.status_code == unknown.status_code == 404
    assert other.json() == unknown.json()


def test_superadmin_sees_every_school(
    client: TestClient, make_user: MakeUser, login: Login, two_schools: tuple[School, School]
) -> None:
    _, umea = two_schools
    login(make_user(email="sa@firstflow.se", role=UserRole.SUPERADMIN))
    response = client.get(f"/api/schools/{umea.id}/users")
    assert {u["email"] for u in response.json()} == {"larare@umea.se", "elev@umea.se"}


@pytest.mark.parametrize("role", ["principal", "syv", "teacher", "student"])
def test_school_admin_creates_account(
    client: TestClient,
    make_user: MakeUser,
    login: Login,
    two_schools: tuple[School, School],
    role: str,
) -> None:
    kramfors, _ = two_schools
    login(make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors))
    response = client.post(
        f"/api/schools/{kramfors.id}/users",
        json={"email": "Ny@Kramfors.se", "name": " Ny Person ", "role": role},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["role"] == role
    assert body["email"] == "ny@kramfors.se"
    assert body["name"] == "Ny Person"
    assert body["school_id"] == str(kramfors.id)


@pytest.mark.parametrize("role", ["school_admin", "superadmin", "supervisor"])
def test_school_admin_cannot_create_these_roles(
    client: TestClient,
    make_user: MakeUser,
    login: Login,
    two_schools: tuple[School, School],
    role: str,
) -> None:
    kramfors, _ = two_schools
    login(make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors))
    response = client.post(
        f"/api/schools/{kramfors.id}/users",
        json={"email": "ny@kramfors.se", "name": "Ny", "role": role},
    )
    assert response.status_code == 422


def test_create_account_with_taken_email(
    client: TestClient, make_user: MakeUser, login: Login, two_schools: tuple[School, School]
) -> None:
    kramfors, _ = two_schools
    login(make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors))
    # E-post är unik i hela Firstflow. 409 avslöjar därför att adressen finns på en annan
    # skola. Det är ett medvetet val, se docs/multi-tenant-och-roller.md.
    response = client.post(
        f"/api/schools/{kramfors.id}/users",
        json={"email": "larare@umea.se", "name": "Dubblett", "role": "teacher"},
    )
    assert response.status_code == 409


@pytest.mark.parametrize(
    "role", [UserRole.TEACHER, UserRole.STUDENT, UserRole.SYV, UserRole.SUPERVISOR]
)
def test_other_roles_cannot_list_or_create(
    client: TestClient,
    make_user: MakeUser,
    login: Login,
    two_schools: tuple[School, School],
    role: UserRole,
) -> None:
    kramfors, _ = two_schools
    login(make_user(email="person@kramfors.se", role=role, in_school=kramfors))
    assert client.get(f"/api/schools/{kramfors.id}/users").status_code == 403
    response = client.post(
        f"/api/schools/{kramfors.id}/users",
        json={"email": "ny@kramfors.se", "name": "Ny", "role": "student"},
    )
    assert response.status_code == 403


def test_principal_cannot_create_accounts(
    client: TestClient, make_user: MakeUser, login: Login, two_schools: tuple[School, School]
) -> None:
    kramfors, _ = two_schools
    login(make_user(email="rektor@kramfors.se", role=UserRole.PRINCIPAL, in_school=kramfors))
    response = client.post(
        f"/api/schools/{kramfors.id}/users",
        json={"email": "ny@kramfors.se", "name": "Ny", "role": "teacher"},
    )
    assert response.status_code == 403


def test_school_endpoints_require_login(
    client: TestClient, two_schools: tuple[School, School]
) -> None:
    kramfors, _ = two_schools
    assert client.get(f"/api/schools/{kramfors.id}/users").status_code == 401


def test_inactive_school_blocks_its_users(
    client: TestClient,
    db: Session,
    make_user: MakeUser,
    login: Login,
    two_schools: tuple[School, School],
) -> None:
    """En avstängd skola: inloggade användare kastas ut och nya inloggningar nekas."""
    kramfors, _ = two_schools
    admin = make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors)
    login(admin)
    assert client.get(f"/api/schools/{kramfors.id}/users").status_code == 200

    kramfors.is_active = False
    db.flush()

    assert client.get("/api/auth/me").status_code == 401
    assert client.get(f"/api/schools/{kramfors.id}/users").status_code == 401
    response = client.post("/api/auth/login", json={"email": admin.email, "password": PASSWORD})
    assert response.status_code == 401


def test_superadmin_still_sees_inactive_school(
    client: TestClient,
    db: Session,
    make_user: MakeUser,
    login: Login,
    two_schools: tuple[School, School],
) -> None:
    kramfors, _ = two_schools
    kramfors.is_active = False
    db.flush()
    login(make_user(email="sa@firstflow.se", role=UserRole.SUPERADMIN))
    assert client.get(f"/api/schools/{kramfors.id}/users").status_code == 200


def test_taken_email_is_case_insensitive(
    client: TestClient, make_user: MakeUser, login: Login, two_schools: tuple[School, School]
) -> None:
    kramfors, _ = two_schools
    login(make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors))
    response = client.post(
        f"/api/schools/{kramfors.id}/users",
        json={"email": "LARARE@Kramfors.se", "name": "Dubblett", "role": "teacher"},
    )
    assert response.status_code == 409


def test_invalid_role_filter(
    client: TestClient, make_user: MakeUser, login: Login, two_schools: tuple[School, School]
) -> None:
    kramfors, _ = two_schools
    login(make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors))
    response = client.get(f"/api/schools/{kramfors.id}/users", params={"role": "hackare"})
    assert response.status_code == 422


def test_concurrent_duplicate_email_gives_409(db: Session, school: School) -> None:
    """Om två anrop hinner förbi kontrollen samtidigt ger det andra 409, inte 500."""
    create_account(db, email="samma@skola.se", name="A", role=UserRole.TEACHER, school_id=school.id)
    # Låtsas att kontrollen inte såg det första kontot, som när två anrop körs samtidigt.
    with patch.object(db, "scalar", return_value=None):
        with pytest.raises(HTTPException) as error:
            create_account(
                db, email="samma@skola.se", name="B", role=UserRole.TEACHER, school_id=school.id
            )
    assert error.value.status_code == 409
    assert db.get(School, school.id) is not None  # sessionen går fortfarande att använda
