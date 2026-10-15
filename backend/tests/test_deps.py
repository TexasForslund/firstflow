from collections.abc import Callable, Iterator
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.api.router import api_router
from app.db.session import get_db
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


@pytest.mark.parametrize("role", [UserRole.STUDENT, UserRole.SUPERVISOR])
def test_require_roles_rejects_other_roles(
    role_client: TestClient, make_user: Callable[..., User], role: UserRole
) -> None:
    _login(role_client, make_user(role=role))
    assert role_client.get("/teacher-only").status_code == 403


def test_require_roles_requires_login(role_client: TestClient) -> None:
    assert role_client.get("/teacher-only").status_code == 401
