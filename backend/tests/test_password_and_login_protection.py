"""B6: inbjudan när konton skapas för hand, Glömt lösenord, begränsning av inloggningsförsök
och loggen över inloggningar och ändringar."""

import re
from collections.abc import Callable, Iterator
from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core import time
from app.core.config import settings
from app.models.school import School
from app.models.security import AuditEvent, PasswordReset
from app.models.user import NO_PASSWORD, User, UserRole
from tests.conftest import PASSWORD

MakeUser = Callable[..., User]
Login = Callable[[User], None]

NEW_PASSWORD = "nytt-lösenord-456"


@pytest.fixture
def invite_mail() -> Iterator[MagicMock]:
    with patch("app.api.routes.invitations.send_email") as send:
        yield send


@pytest.fixture
def reset_mail() -> Iterator[MagicMock]:
    with patch("app.api.routes.auth.send_email") as send:
        yield send


def link_token(mail: MagicMock, path: str) -> str:
    body = mail.call_args.args[2]
    match = re.search(rf"/{path}/([A-Za-z0-9_-]+)", body)
    assert match, body
    return match.group(1)


def login_as(client: TestClient, email: str, password: str = PASSWORD) -> int:
    return client.post("/api/auth/login", json={"email": email, "password": password}).status_code


def audit(db: Session, action: str | None = None) -> list[AuditEvent]:
    query = select(AuditEvent).order_by(AuditEvent.created_at)
    if action:
        query = query.where(AuditEvent.action == action)
    return list(db.scalars(query))


# --- Inbjudan när konton skapas för hand --------------------------------------------------


def test_student_created_by_hand_gets_invite_and_chooses_password(
    client: TestClient, make_user: MakeUser, login: Login, invite_mail: MagicMock
) -> None:
    login(make_user(email="admin@skola.se", role=UserRole.SCHOOL_ADMIN))
    created = client.post("/api/students", json={"email": "Elev@Skola.se", "name": "Elev Ett"})
    assert created.status_code == 201

    assert invite_mail.call_args.args[0] == "elev@skola.se"
    token = link_token(invite_mail, "invite")
    client.post("/api/auth/logout")

    assert client.get(f"/api/invite/{token}").json()["kind"] == "account"
    accepted = client.post(f"/api/invite/{token}/accept", json={"password": NEW_PASSWORD})
    assert accepted.status_code == 200
    assert accepted.json()["role"] == "student"
    client.post("/api/auth/logout")
    assert login_as(client, "elev@skola.se", NEW_PASSWORD) == 200


def test_school_user_without_invite(
    client: TestClient, make_user: MakeUser, login: Login, school: School, invite_mail: MagicMock
) -> None:
    login(make_user(email="admin@skola.se", role=UserRole.SCHOOL_ADMIN))
    response = client.post(
        f"/api/schools/{school.id}/users",
        json={"email": "lar@skola.se", "name": "Lärare", "role": "teacher", "send_invite": False},
    )
    assert response.status_code == 201
    assert response.json()["has_password"] is False
    invite_mail.assert_not_called()


def test_superadmin_creating_school_admin_sends_invite(
    client: TestClient, make_user: MakeUser, login: Login, school: School, invite_mail: MagicMock
) -> None:
    login(make_user(email="super@firstflow.se", role=UserRole.SUPERADMIN))
    response = client.post(
        f"/api/superadmin/schools/{school.id}/admins",
        json={"email": "ny-admin@skola.se", "name": "Ny Admin"},
    )
    assert response.status_code == 201
    assert invite_mail.call_args.args[0] == "ny-admin@skola.se"


def test_resend_account_invite(
    client: TestClient,
    db: Session,
    make_user: MakeUser,
    make_school: Callable[..., School],
    login: Login,
    school: School,
    invite_mail: MagicMock,
) -> None:
    waiting = make_user(email="vantar@skola.se", role=UserRole.STUDENT)
    waiting.password_hash = NO_PASSWORD
    has_password = make_user(email="klar@skola.se", role=UserRole.STUDENT)
    other = make_user(email="annan@annan.se", in_school=make_school("Annan skola"))
    other.password_hash = NO_PASSWORD
    teacher = make_user(email="larare@skola.se")
    db.flush()
    url = f"/api/schools/{school.id}/users/{{}}/invite"

    assert client.post(url.format(waiting.id)).status_code == 401
    login(teacher)
    assert client.post(url.format(waiting.id)).status_code == 403

    login(make_user(email="admin@skola.se", role=UserRole.SCHOOL_ADMIN))
    first = client.post(url.format(waiting.id))
    assert first.status_code == 200
    assert first.json()["has_password"] is False
    old_token = link_token(invite_mail, "invite")
    assert client.post(url.format(waiting.id)).status_code == 200
    assert link_token(invite_mail, "invite") != old_token
    assert client.get(f"/api/invite/{old_token}").status_code == 404

    assert client.post(url.format(has_password.id)).status_code == 409
    assert client.post(url.format(other.id)).status_code == 404


# --- Glömt lösenord -----------------------------------------------------------------------


def test_forgot_password_flow(
    client: TestClient, make_user: MakeUser, reset_mail: MagicMock
) -> None:
    user = make_user(email="elev@skola.se", role=UserRole.STUDENT)
    other_device = TestClient(client.app)
    assert login_as(other_device, user.email) == 200

    response = client.post("/api/auth/forgot-password", json={"email": " ELEV@skola.se "})
    assert response.status_code == 204
    assert reset_mail.call_args.args[0] == "elev@skola.se"
    token = link_token(reset_mail, "reset-password")

    assert client.get(f"/api/auth/reset-password/{token}").json() == {"email": "elev@skola.se"}
    short = client.post(f"/api/auth/reset-password/{token}", json={"password": "kort"})
    assert short.status_code == 422

    reset = client.post(f"/api/auth/reset-password/{token}", json={"password": NEW_PASSWORD})
    assert reset.status_code == 200
    assert reset.json()["email"] == "elev@skola.se"
    assert client.get("/api/auth/me").status_code == 200
    # Andra enheter loggas ut.
    assert other_device.get("/api/auth/me").status_code == 401

    # Länken går bara att använda en gång, och det gamla lösenordet gäller inte.
    again = client.post(f"/api/auth/reset-password/{token}", json={"password": NEW_PASSWORD})
    assert again.status_code == 404
    assert login_as(client, user.email) == 401
    assert login_as(client, user.email, NEW_PASSWORD) == 200


def test_forgot_password_does_not_reveal_accounts(
    client: TestClient, make_user: MakeUser, reset_mail: MagicMock
) -> None:
    make_user(email="avstangd@skola.se", is_active=False)
    for email in ("finns-inte@skola.se", "avstangd@skola.se"):
        assert client.post("/api/auth/forgot-password", json={"email": email}).status_code == 204
    reset_mail.assert_not_called()


def test_new_reset_link_replaces_old_and_links_expire(
    client: TestClient, db: Session, make_user: MakeUser, reset_mail: MagicMock
) -> None:
    make_user(email="elev@skola.se", role=UserRole.STUDENT)
    client.post("/api/auth/forgot-password", json={"email": "elev@skola.se"})
    first = link_token(reset_mail, "reset-password")
    client.post("/api/auth/forgot-password", json={"email": "elev@skola.se"})
    second = link_token(reset_mail, "reset-password")
    assert client.get(f"/api/auth/reset-password/{first}").status_code == 404
    assert client.get(f"/api/auth/reset-password/{second}").status_code == 200

    db.execute(update(PasswordReset).values(expires_at=time.now() - timedelta(minutes=1)))
    assert client.get(f"/api/auth/reset-password/{second}").status_code == 404
    assert client.get("/api/auth/reset-password/hittepa").status_code == 404


def test_reset_password_replaces_pending_account_invite(
    client: TestClient,
    make_user: MakeUser,
    login: Login,
    invite_mail: MagicMock,
    reset_mail: MagicMock,
) -> None:
    login(make_user(email="admin@skola.se", role=UserRole.SCHOOL_ADMIN))
    client.post("/api/students", json={"email": "elev@skola.se", "name": "Elev"})
    invite_token = link_token(invite_mail, "invite")
    client.post("/api/auth/logout")

    client.post("/api/auth/forgot-password", json={"email": "elev@skola.se"})
    token = link_token(reset_mail, "reset-password")
    client.post(f"/api/auth/reset-password/{token}", json={"password": NEW_PASSWORD})
    assert client.get(f"/api/invite/{invite_token}").status_code == 404


def test_forgot_password_is_rate_limited(
    client: TestClient, make_user: MakeUser, reset_mail: MagicMock
) -> None:
    make_user(email="elev@skola.se", role=UserRole.STUDENT)
    for _ in range(settings.password_reset_max_per_email):
        assert (
            client.post("/api/auth/forgot-password", json={"email": "elev@skola.se"}).status_code
            == 204
        )
    blocked = client.post("/api/auth/forgot-password", json={"email": "elev@skola.se"})
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
    assert reset_mail.call_count == settings.password_reset_max_per_email


# --- Begränsning av inloggningsförsök -----------------------------------------------------


def test_login_blocked_after_too_many_failures(client: TestClient, make_user: MakeUser) -> None:
    user = make_user()
    for _ in range(settings.login_max_failures_per_email):
        assert login_as(client, user.email, "fel-lösenord") == 401

    # Även rätt lösenord stoppas under spärrtiden, och svaret säger hur länge.
    blocked = client.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
    assert blocked.status_code == 429
    retry_after = int(blocked.headers["Retry-After"])
    assert 0 < retry_after <= settings.login_window_minutes * 60 + 1
    # E-posten räknas oavsett skiftläge.
    assert login_as(client, user.email.upper()) == 429


def test_successful_login_resets_failures(client: TestClient, make_user: MakeUser) -> None:
    user = make_user()
    for _ in range(settings.login_max_failures_per_email - 1):
        login_as(client, user.email, "fel-lösenord")
    assert login_as(client, user.email) == 200
    for _ in range(settings.login_max_failures_per_email - 1):
        assert login_as(client, user.email, "fel-lösenord") == 401


def test_login_blocked_per_ip(
    client: TestClient, make_user: MakeUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "login_max_failures_per_ip", 3)
    user = make_user()
    for n in range(3):
        assert login_as(client, f"finns-inte-{n}@skola.se", "fel") == 401
    assert login_as(client, user.email) == 429


def test_failures_outside_window_do_not_count(
    client: TestClient, db: Session, make_user: MakeUser
) -> None:
    from app.models.security import RateLimitEvent

    user = make_user()
    for _ in range(settings.login_max_failures_per_email):
        login_as(client, user.email, "fel-lösenord")
    db.execute(
        update(RateLimitEvent).values(
            created_at=time.now() - timedelta(minutes=settings.login_window_minutes + 1)
        )
    )
    assert login_as(client, user.email) == 200


# --- Loggen -------------------------------------------------------------------------------


def test_logins_are_logged_without_personal_data(
    client: TestClient, db: Session, make_user: MakeUser
) -> None:
    user = make_user()
    login_as(client, user.email, "fel-lösenord")
    login_as(client, "finns-inte@skola.se", "fel")
    login_as(client, user.email)
    client.post("/api/auth/logout")

    events = [(e.action, e.actor_id) for e in audit(db) if e.action.startswith("auth.")]
    assert events == [
        ("auth.login_failed", user.id),
        ("auth.login_failed", None),
        ("auth.login", user.id),
        ("auth.logout", user.id),
    ]


def test_changes_are_logged_with_fields_but_no_values(
    client: TestClient,
    db: Session,
    make_user: MakeUser,
    login: Login,
    invite_mail: MagicMock,
) -> None:
    admin = make_user(email="admin@skola.se", role=UserRole.SCHOOL_ADMIN)
    teacher = make_user(email="larare@skola.se")
    login(admin)
    created = client.post(
        "/api/students",
        json={
            "email": "elev@skola.se",
            "name": "Hemlig Elevsson",
            "teacher_ids": [str(teacher.id)],
        },
    )
    student_id = created.json()["id"]
    client.put("/api/me/preferences", json={"text_size": "large"})

    changes = [e for e in audit(db) if not e.action.startswith("auth.")]
    assert all(e.actor_id == admin.id for e in changes)
    assert ("insert", "users", student_id) in [(e.action, e.entity, e.entity_id) for e in changes]
    assert ("insert", "teacher_students") in [(e.action, e.entity) for e in changes]
    assert ("insert", "invitations") in [(e.action, e.entity) for e in changes]

    # Inga namn, e-postadresser eller värden i loggen.
    for event in audit(db):
        text = " ".join(
            str(v) for v in (event.action, event.entity, event.entity_id, event.fields) if v
        )
        assert "Hemlig" not in text and "@" not in text and "large" not in text


def test_update_logs_changed_fields(
    client: TestClient, db: Session, make_user: MakeUser, login: Login
) -> None:
    user = make_user()
    login(user)
    response = client.put("/api/me/preferences", json={"text_size": "large"})
    assert response.status_code == 200
    updates = [e for e in audit(db, "update") if e.entity == "users"]
    assert [(e.entity_id, e.fields) for e in updates] == [(str(user.id), ["display_preferences"])]


def test_changes_without_logged_in_user_are_not_logged(db: Session, school: School) -> None:
    db.add(
        User(
            email="skript@skola.se",
            name="Skript",
            role=UserRole.TEACHER,
            school=school,
            password_hash=NO_PASSWORD,
        )
    )
    db.commit()
    assert audit(db) == []
