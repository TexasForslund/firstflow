from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.school import School
from app.models.user import User, UserRole, UserSession
from tests.conftest import PASSWORD

MakeUser = Callable[..., User]


def test_login_sets_cookie_and_me_returns_user(
    client: TestClient, make_user: MakeUser, school: School
) -> None:
    user = make_user(role=UserRole.STUDENT)

    response = client.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
    assert response.status_code == 200
    assert response.json() == {
        "id": str(user.id),
        "email": "larare@skola.se",
        "name": "Testperson",
        "role": "student",
        "school_id": str(school.id),
        "school_name": "Testskolan",
        "preferences": {
            "text_size": "normal",
            "high_contrast": False,
            "reduce_motion": "system",
            "more_spacing": False,
        },
    }
    cookie = response.headers["set-cookie"]
    assert settings.session_cookie_name in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == str(user.id)


def test_login_ignores_case_and_whitespace_in_email(
    client: TestClient, make_user: MakeUser
) -> None:
    make_user()
    response = client.post(
        "/api/auth/login", json={"email": "  Larare@Skola.SE ", "password": PASSWORD}
    )
    assert response.status_code == 200


def test_login_rejects_wrong_password(client: TestClient, make_user: MakeUser) -> None:
    user = make_user()
    response = client.post("/api/auth/login", json={"email": user.email, "password": "fel"})
    assert response.status_code == 401
    assert settings.session_cookie_name not in response.headers.get("set-cookie", "")


def test_login_rejects_unknown_email(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"email": "finns.inte@skola.se", "password": PASSWORD}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Fel e-post eller lösenord"


def test_login_rejects_inactive_user(client: TestClient, make_user: MakeUser) -> None:
    user = make_user(is_active=False)
    response = client.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
    assert response.status_code == 401


def test_me_requires_login(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_me_rejects_unknown_token(client: TestClient) -> None:
    client.cookies.set(settings.session_cookie_name, "ogiltig-token")
    assert client.get("/api/auth/me").status_code == 401


def test_me_rejects_expired_session(
    client: TestClient, db: Session, make_user: MakeUser, login: Callable[[User], None]
) -> None:
    user = make_user()
    login(user)
    session = db.scalar(select(UserSession).where(UserSession.user_id == user.id))
    assert session is not None
    session.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.flush()

    assert client.get("/api/auth/me").status_code == 401


def test_me_rejects_user_deactivated_after_login(
    client: TestClient, db: Session, make_user: MakeUser, login: Callable[[User], None]
) -> None:
    user = make_user()
    login(user)
    user.is_active = False
    db.flush()

    assert client.get("/api/auth/me").status_code == 401


def test_logout_ends_session(
    client: TestClient, db: Session, make_user: MakeUser, login: Callable[[User], None]
) -> None:
    user = make_user()
    login(user)

    response = client.post("/api/auth/logout")
    assert response.status_code == 204
    assert db.scalar(select(UserSession).where(UserSession.user_id == user.id)) is None
    assert client.get("/api/auth/me").status_code == 401


def test_logout_without_session_is_ok(client: TestClient) -> None:
    assert client.post("/api/auth/logout").status_code == 204


def test_session_token_is_stored_hashed(
    client: TestClient, db: Session, make_user: MakeUser
) -> None:
    user = make_user()
    response = client.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
    token = response.cookies[settings.session_cookie_name]
    session = db.scalar(select(UserSession).where(UserSession.user_id == user.id))
    assert session is not None
    assert session.token_hash != token


def test_me_has_no_school_for_superadmin(
    client: TestClient, make_user: MakeUser, login: Callable[[User], None]
) -> None:
    login(make_user(email="admin@firstflow.se", role=UserRole.SUPERADMIN))
    body = client.get("/api/auth/me").json()
    assert body["role"] == "superadmin"
    assert body["school_id"] is None
    assert body["school_name"] is None
