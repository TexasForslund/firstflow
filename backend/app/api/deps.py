from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyCookie
from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_session_token
from app.db.session import DbSession
from app.models.user import User, UserRole, UserSession

session_cookie = APIKeyCookie(name=settings.session_cookie_name, auto_error=False)


def get_current_user(db: DbSession, token: Annotated[str | None, Depends(session_cookie)]) -> User:
    """Den inloggade användaren.

    Svarar 401 om sessionen saknas, har gått ut eller om kontot är avstängt.
    """
    if token:
        user = db.scalar(
            select(User)
            .join(UserSession)
            .where(
                UserSession.token_hash == hash_session_token(token),
                UserSession.expires_at > datetime.now(UTC),
                User.is_active,
            )
        )
        if user is not None:
            return user
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Du är inte inloggad")


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_same_school(user: User, school_id: UUID | None) -> None:
    """Släpper igenom användare på samma skola som resursen, och superadmin.

    Anropa i varje endpoint som rör en skolas data, utöver rollkontrollen. Svarar 404,
    inte 403, så att det inte går att se om en annan skolas resurs finns.
    """
    if user.role == UserRole.SUPERADMIN:
        return
    if school_id is None or user.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


def require_roles(*roles: UserRole) -> Callable[[User], User]:
    """Beroende som släpper igenom användare med någon av rollerna, annars 403.

    Exempel: def list_classes(user: Annotated[User, Depends(require_roles(UserRole.TEACHER))])
    Rollen räcker inte för elevdata: kontrollera också att användaren är kopplad till eleven.
    """

    def check(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Du saknar behörighet")
        return user

    return check
