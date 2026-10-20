"""Svarsmodeller som används av flera områden i API:t."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.user import UserRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    name: str
    role: UserRole
    school_id: UUID | None
    school_name: str | None


class SchoolRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    org_number: str | None
    is_active: bool
    created_at: datetime
