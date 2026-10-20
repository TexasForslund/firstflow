"""Skapa konton. Ingen kan registrera sig själv: konton skapas uppifrån i rollhierarkin."""

from uuid import UUID

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import normalize_email
from app.models.user import ROLES_WITHOUT_SCHOOL, User, UserRole

# Ett lösenord som aldrig godkänns av verify_password. Lösenordet sätts via inbjudan (B6).
NO_PASSWORD = "!"


class AccountCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    name: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        email = normalize_email(value)
        local, _, domain = email.partition("@")
        if not local or "." not in domain or " " in email:
            raise ValueError("Ogiltig e-postadress")
        return email

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Namnet får inte vara tomt")
        return name


def create_account(
    db: Session,
    *,
    email: str,
    name: str,
    role: UserRole,
    school_id: UUID | None,
    password_hash: str = NO_PASSWORD,
) -> User:
    """Skapar ett konto. Svarar 409 om e-postadressen redan används."""
    if (role in ROLES_WITHOUT_SCHOOL) != (school_id is None):
        raise ValueError(
            f"Rollen {role} kräver {'ingen' if role in ROLES_WITHOUT_SCHOOL else 'en'} skola"
        )
    email = normalize_email(email)
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Det finns redan ett konto med den e-postadressen"
        )
    user = User(email=email, name=name, role=role, school_id=school_id, password_hash=password_hash)
    db.add(user)
    db.flush()
    return user
