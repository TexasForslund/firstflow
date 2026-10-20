import uuid
from collections.abc import Callable, Iterator
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.deps import require_roles, require_same_school
from app.api.router import api_router
from app.db.session import get_db
from app.models.school import School
from app.models.user import User, UserRole
from tests.conftest import PASSWORD

TeacherOnly = Annotated[User, Depends(require_roles(UserRole.TEACHER))]


@pytest.fixture
def role_client(db: Session) -> Iterator[TestClient]:
    """En egen liten app med en endpoint som bara lärare får anropa."""
    test_app = FastAPI()
    test_app.include_router(api_router)

    @test_app.get("/teacher-only")
    def teacher_only(user: TeacherOnly) -> dict[str, str]:
        return {"role": user.role}

    test_app.dependency_overrides[get_db] = lambda: db
    with TestClient(test_app) as client:
        yield client


def _login(client: TestClient, user: User) -> None:
    response = client.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
    assert response.status_code == 200


def test_require_roles_allows_matching_role(
    role_client: TestClient, make_user: Callable[..., User]
) -> None:
    _login(role_client, make_user(role=UserRole.TEACHER))
    assert role_client.get("/teacher-only").json() == {"role": "teacher"}


@pytest.mark.parametrize("role", [r for r in UserRole if r != UserRole.TEACHER])
def test_require_roles_rejects_other_roles(
    role_client: TestClient, make_user: Callable[..., User], role: UserRole
) -> None:
    _login(role_client, make_user(email=f"{role}@skola.se", role=role))
    assert role_client.get("/teacher-only").status_code == 403


def test_require_roles_requires_login(role_client: TestClient) -> None:
    assert role_client.get("/teacher-only").status_code == 401


def test_require_same_school(
    make_user: Callable[..., User], make_school: Callable[..., School]
) -> None:
    own, other = make_school("Egna"), make_school("Andra")
    teacher = make_user(role=UserRole.TEACHER, in_school=own)
    superadmin = make_user(email="sa@firstflow.se", role=UserRole.SUPERADMIN)
    supervisor = make_user(email="hl@foretag.se", role=UserRole.SUPERVISOR)

    require_same_school(teacher, own.id)
    require_same_school(superadmin, other.id)
    for user, school_id in [(teacher, other.id), (teacher, None), (supervisor, own.id)]:
        with pytest.raises(HTTPException) as error:
            require_same_school(user, school_id)
        assert error.value.status_code == 404
    with pytest.raises(HTTPException):
        require_same_school(teacher, uuid.uuid4())
