"""Svarsmodeller som används av flera områden i API:t."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.user import UserRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    name: str
    role: UserRole
    school_id: UUID | None
    school_name: str | None


class DisplayPreferences(BaseModel):
    """Hur Firstflow visas för användaren. Inställningar, Visning.

    Namnen följer mobilens tillgänglighetsinställningar så att de känns igen.
    """

    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)

    text_size: Literal["small", "normal", "large", "largest"] = Field(
        default="normal",
        description="Textstorlek: cirka 10 % mindre, normal, cirka 15 % större eller 30 % större",
    )
    high_contrast: bool = Field(default=False, description="Öka kontrasten")
    reduce_motion: Literal["system", "always"] = Field(
        default="system", description="Minska rörelse: följ datorns inställning eller alltid"
    )
    more_spacing: bool = Field(default=False, description="Mer luft i texten (WCAG 1.4.12)")


class MeRead(UserRead):
    """Den inloggade användaren med egna inställningar. Visas bara för användaren själv."""

    preferences: DisplayPreferences


def me_read(user: Any) -> MeRead:
    return MeRead.model_validate(
        {
            **UserRead.model_validate(user).model_dump(),
            # Okända eller gamla värden ignoreras, så att de inte stoppar inloggningen.
            "preferences": _safe_preferences(user.display_preferences or {}),
        }
    )


def _safe_preferences(raw: dict[str, Any]) -> DisplayPreferences:
    clean: dict[str, Any] = {}
    for name in DisplayPreferences.model_fields:
        if name in raw:
            try:
                DisplayPreferences.model_validate({name: raw[name]})
                clean[name] = raw[name]
            except ValueError:
                pass
    return DisplayPreferences.model_validate(clean)


class SchoolRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    org_number: str | None
    is_active: bool
    created_at: datetime
