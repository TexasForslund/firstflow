"""Egna inställningar: visning och utloggning på andra enheter."""

from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.user import User, UserRole, UserSession
from tests.conftest import PASSWORD

MakeUser = Callable[..., User]
Login = Callable[[User], None]

BIG = {
    "text_size": "largest",
    "high_contrast": True,
    "reduce_motion": "always",
    "more_spacing": True,
}


def test_preferences_are_saved_and_returned_by_me(
    client: TestClient, make_user: MakeUser, login: Login
) -> None:
    user = make_user(role=UserRole.STUDENT)
    login(user)
    assert client.get("/api/auth/me").json()["preferences"]["text_size"] == "normal"
    response = client.put("/api/me/preferences", json=BIG)
    assert response.status_code == 200
    assert response.json() == BIG
    assert client.get("/api/auth/me").json()["preferences"] == BIG


def test_preferences_follow_the_account_to_a_new_login(
    client: TestClient, make_user: MakeUser, login: Login
) -> None:
    user = make_user()
    login(user)
    client.put("/api/me/preferences", json=BIG)
    client.post("/api/auth/logout")
    response = client.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
    assert response.json()["preferences"] == BIG


def test_smaller_text_is_allowed(client: TestClient, make_user: MakeUser, login: Login) -> None:
    login(make_user())
    body = {**BIG, "text_size": "small"}
    assert client.put("/api/me/preferences", json=body).json()["text_size"] == "small"


def test_invalid_preferences_are_rejected(
    client: TestClient, make_user: MakeUser, login: Login
) -> None:
    login(make_user())
    for body in ({"text_size": "huge"}, {"reduce_motion": "never"}, {"theme": "dark"}):
        assert client.put("/api/me/preferences", json=body).status_code == 422


def test_unknown_stored_values_are_ignored(
    client: TestClient, make_user: MakeUser, login: Login, db: Session
) -> None:
    user = make_user()
    db.execute(
        update(User)
        .where(User.id == user.id)
        .values(display_preferences={"text_size": "gigantic", "high_contrast": True, "old": 1})
    )
    db.flush()
    login(user)
    preferences = client.get("/api/auth/me").json()["preferences"]
    assert preferences["text_size"] == "normal"
    assert preferences["high_contrast"] is True


def test_other_users_do_not_see_preferences(
    client: TestClient, make_user: MakeUser, login: Login
) -> None:
    admin = make_user(email="admin@skola.se", role=UserRole.SCHOOL_ADMIN)
    make_user(email="elev@skola.se", role=UserRole.STUDENT)
    login(admin)
    users = client.get(f"/api/schools/{admin.school_id}/users").json()
    assert users and all("preferences" not in u for u in users)


def test_preferences_require_login(client: TestClient) -> None:
    assert client.put("/api/me/preferences", json={}).status_code == 401
    assert client.post("/api/me/sessions/logout-others").status_code == 401


def test_logout_other_devices_keeps_this_one(
    client: TestClient, make_user: MakeUser, login: Login, db: Session
) -> None:
    user = make_user()
    other = TestClient(client.app)
    for _ in range(2):  # två andra enheter
        assert (
            other.post(
                "/api/auth/login", json={"email": user.email, "password": PASSWORD}
            ).status_code
            == 200
        )
    login(user)
    response = client.post("/api/me/sessions/logout-others")
    assert response.json() == {"ended": 2}
    assert client.get("/api/auth/me").status_code == 200
    assert other.get("/api/auth/me").status_code == 401
    count = db.scalar(select(func.count()).where(UserSession.user_id == user.id))
    assert count == 1
