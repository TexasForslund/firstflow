"""Inloggning, utloggning och Glömt lösenord.

Skydd (B6):
- Misslyckade inloggningar räknas per e-post och IP. Efter för många försök inom
  `LOGIN_WINDOW_MINUTES` svarar inloggningen 429 med `Retry-After`, även med rätt lösenord.
- Glömt lösenord svarar alltid 204, så att det inte går att se om e-posten har ett konto.
  Länken i mejlet gäller i `PASSWORD_RESET_LIFETIME_MINUTES` och kan bara användas en gång.
  Ett nytt lösenord loggar ut kontot på alla andra enheter.
- Inloggningar, misslyckade försök, spärrar och lösenordsbyten loggas i `audit_events`, utan
  e-post eller namn.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update

from app.api.deps import CurrentUser, session_cookie
from app.api.schemas import MeRead, me_read
from app.core import time
from app.core.config import settings
from app.core.security import (
    hash_password,
    hash_session_token,
    new_session_token,
    normalize_email,
    verify_password,
)
from app.db.session import DbSession
from app.models.invitation import Invitation, InvitationKind
from app.models.school import School
from app.models.security import PasswordReset
from app.models.user import User, UserSession
from app.services import rate_limit
from app.services.accounts import PASSWORD_MIN
from app.services.audit import log_event, set_actor
from app.services.email import EmailNotConfigured, send_email

logger = logging.getLogger("firstflow.auth")

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=200)


def start_session(db: DbSession, user: User, response: Response) -> None:
    """Loggar in användaren: skapar en session och sätter cookien. Används även när en
    handledare har tackat ja till en inbjudan."""
    now = datetime.now(UTC)
    # Städa bort användarens utgångna sessioner i samma veva.
    db.execute(
        delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at <= now)
    )
    token = new_session_token()
    lifetime = timedelta(days=settings.session_lifetime_days)
    db.add(UserSession(user=user, token_hash=hash_session_token(token), expires_at=now + lifetime))
    db.commit()

    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=int(lifetime.total_seconds()),
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )


def _can_log_in(user: User | None) -> bool:
    return user is not None and user.is_active and (user.school is None or user.school.is_active)


@router.post(
    "/login",
    response_model=MeRead,
    responses={429: {"description": "För många misslyckade försök. Se Retry-After."}},
)
def login(body: LoginRequest, request: Request, db: DbSession, response: Response) -> MeRead:
    set_actor(db, None)
    email = normalize_email(body.email)
    ip = rate_limit.client_ip(request)
    user = db.scalar(select(User).where(User.email == email))
    limit = rate_limit.login_limit()
    try:
        rate_limit.check(db, limit, email, ip)
    except HTTPException:
        log_event(db, "auth.login_blocked", user.id if user else None)
        db.commit()
        raise

    password_ok = verify_password(body.password, user.password_hash if user else None)
    if not password_ok or not _can_log_in(user):
        rate_limit.record(db, limit, email, ip)
        log_event(db, "auth.login_failed", user.id if user else None)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Fel e-post eller lösenord")

    assert user is not None
    rate_limit.clear(db, limit, email)
    log_event(db, "auth.login", user.id)
    start_session(db, user, response)
    return me_read(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    db: DbSession, response: Response, token: Annotated[str | None, Depends(session_cookie)]
) -> None:
    if token:
        user_id = db.scalar(
            select(UserSession.user_id).where(UserSession.token_hash == hash_session_token(token))
        )
        db.execute(delete(UserSession).where(UserSession.token_hash == hash_session_token(token)))
        if user_id is not None:
            log_event(db, "auth.logout", user_id)
        db.commit()
    response.delete_cookie(
        settings.session_cookie_name,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )


@router.get("/me", response_model=MeRead)
def me(user: CurrentUser) -> MeRead:
    """Den inloggade användaren, med egna visningsinställningar."""
    return me_read(user)


# --- Glömt lösenord -----------------------------------------------------------------------


class ForgotPassword(BaseModel):
    email: str = Field(max_length=320)


class ResetPreview(BaseModel):
    email: str


class ResetPassword(BaseModel):
    password: str = Field(min_length=PASSWORD_MIN, max_length=200)


def _send_reset_email(to: str, link: str) -> None:
    subject = "Välj ett nytt lösenord i Firstflow"
    body = (
        "Hej!\n\n"
        "Någon har bett om ett nytt lösenord till ditt konto i Firstflow. "
        f"Välj ett nytt lösenord här:\n{link}\n\n"
        f"Länken gäller i {settings.password_reset_lifetime_minutes} minuter "
        "och kan bara användas en gång.\n\n"
        "Har du inte bett om ett nytt lösenord kan du strunta i det här mejlet. "
        "Ditt lösenord ändras inte.\n\n"
        "Hälsningar\nFirstflow"
    )
    try:
        send_email(to, subject, body)
    except EmailNotConfigured:
        # Mottagaren loggas inte.
        logger.error("Mejl om nytt lösenord kunde inte skickas: SMTP är inte inställt")


@router.post(
    "/forgot-password",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={429: {"description": "För många begäranden. Se Retry-After."}},
)
def forgot_password(
    body: ForgotPassword, request: Request, db: DbSession, background: BackgroundTasks
) -> None:
    """Skickar ett mejl med en länk där användaren väljer ett nytt lösenord.

    Svarar alltid 204, även när e-posten inte har något konto, så att det inte går att se
    vilka adresser som finns. Mejlet skickas efter svaret, så att svarstiden inte heller
    avslöjar det. En tidigare länk slutar gälla.
    """
    set_actor(db, None)
    email = normalize_email(body.email)
    ip = rate_limit.client_ip(request)
    limit = rate_limit.password_reset_limit()
    rate_limit.check(db, limit, email, ip)
    rate_limit.record(db, limit, email, ip)

    user = db.scalar(select(User).where(User.email == email))
    if _can_log_in(user):
        assert user is not None
        now = time.now()
        db.execute(
            delete(PasswordReset).where(
                PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None)
            )
        )
        token = new_session_token()
        db.add(
            PasswordReset(
                user_id=user.id,
                token_hash=hash_session_token(token),
                created_at=now,
                expires_at=now + timedelta(minutes=settings.password_reset_lifetime_minutes),
            )
        )
        log_event(db, "auth.password_reset_requested", user.id)
        link = f"{settings.frontend_url.rstrip('/')}/reset-password/{token}"
        background.add_task(_send_reset_email, user.email, link)
    db.commit()


def _reset_by_token(db: DbSession, token: str) -> PasswordReset:
    """Länken om den går att använda, annars 404."""
    reset = db.scalar(
        select(PasswordReset)
        .join(User)
        .outerjoin(School, User.school_id == School.id)
        .where(
            PasswordReset.token_hash == hash_session_token(token),
            PasswordReset.used_at.is_(None),
            PasswordReset.expires_at > time.now(),
            User.is_active,
            (User.school_id.is_(None)) | School.is_active,
        )
    )
    if reset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Länken finns inte eller har gått ut")
    return reset


@router.get("/reset-password/{token}", response_model=ResetPreview)
def preview_password_reset(token: str, db: DbSession) -> ResetPreview:
    """Visar vilket konto länken gäller, så att sidan kan visa e-posten."""
    return ResetPreview(email=_reset_by_token(db, token).user.email)


@router.post("/reset-password/{token}", response_model=MeRead)
def reset_password(token: str, body: ResetPassword, db: DbSession, response: Response) -> MeRead:
    """Sätter det nya lösenordet, loggar ut kontot överallt och loggar in här."""
    set_actor(db, None)
    reset = _reset_by_token(db, token)
    # Lås raden så att samma länk inte kan användas två gånger samtidigt.
    db.execute(select(PasswordReset.id).where(PasswordReset.id == reset.id).with_for_update())
    db.refresh(reset)
    if reset.used_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Länken finns inte eller har gått ut")
    user = reset.user
    now = time.now()
    reset.used_at = now
    user.password_hash = hash_password(body.password)
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    # En inbjudan att välja lösenord behövs inte längre.
    db.execute(
        update(Invitation)
        .where(
            Invitation.kind == InvitationKind.ACCOUNT,
            Invitation.email == user.email,
            Invitation.accepted_at.is_(None),
            Invitation.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    rate_limit.clear(db, rate_limit.login_limit(), user.email)
    log_event(db, "auth.password_reset", user.id)
    start_session(db, user, response)
    return me_read(user)
