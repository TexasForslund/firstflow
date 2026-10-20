"""Den inloggades egna inställningar (Inställningar i menyn).

Namn, e-post och roll ändras inte här. Konton skapas och ändras uppifrån av skoladmin och
superadmin. Här finns bara det som gäller användaren själv: hur Firstflow visas och
inloggningar på andra enheter.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import delete

from app.api.deps import CurrentUser, session_cookie
from app.api.schemas import DisplayPreferences
from app.core.security import hash_session_token
from app.db.session import DbSession
from app.models.user import UserSession

router = APIRouter(prefix="/me", tags=["me"])


@router.put("/preferences", response_model=DisplayPreferences)
def set_preferences(
    body: DisplayPreferences, db: DbSession, user: CurrentUser
) -> DisplayPreferences:
    """Sparar visningsinställningarna. Alla fält skrivs över."""
    user.display_preferences = body.model_dump()
    db.commit()
    return body


class SessionsEnded(BaseModel):
    ended: int


@router.post("/sessions/logout-others", response_model=SessionsEnded)
def logout_other_devices(
    db: DbSession, user: CurrentUser, token: Annotated[str | None, Depends(session_cookie)]
) -> SessionsEnded:
    """Loggar ut användaren på alla andra enheter. Den här inloggningen finns kvar."""
    current = hash_session_token(token) if token else ""
    result = db.execute(
        delete(UserSession).where(UserSession.user_id == user.id, UserSession.token_hash != current)
    )
    db.commit()
    return SessionsEnded(ended=result.rowcount)
