from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.api.deps import CurrentUser, session_cookie
from app.api.schemas import UserRead
from app.core.config import settings
from app.core.security import (
    hash_session_token,
    new_session_token,
    normalize_email,
    verify_password,
)
from app.db.session import DbSession
from app.models.user import User, UserSession

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=200)


@router.post("/login", response_model=UserRead)
def login(body: LoginRequest, db: DbSession, response: Response) -> User:
    user = db.scalar(select(User).where(User.email == normalize_email(body.email)))
    password_ok = verify_password(body.password, user.password_hash if user else None)
    school_active = user is None or user.school is None or user.school.is_active
    if user is None or not password_ok or not user.is_active or not school_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Fel e-post eller lösenord")

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
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    db: DbSession, response: Response, token: Annotated[str | None, Depends(session_cookie)]
) -> None:
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == hash_session_token(token)))
        db.commit()
    response.delete_cookie(
        settings.session_cookie_name,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )


@router.get("/me", response_model=UserRead)
def me(user: CurrentUser) -> User:
    return user
