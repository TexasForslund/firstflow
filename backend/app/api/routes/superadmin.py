"""Endpoints för Firstflow-teamet: skapa skolor och deras första administratör."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import require_roles
from app.api.schemas import SchoolRead, UserRead
from app.db.session import DbSession
from app.models.school import School
from app.models.user import User, UserRole
from app.services.accounts import AccountCreate, create_account

router = APIRouter(prefix="/superadmin", tags=["superadmin"])

Superadmin = Annotated[User, Depends(require_roles(UserRole.SUPERADMIN))]


class SchoolCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    org_number: str | None = Field(default=None, max_length=20)


@router.post("/schools", response_model=SchoolRead, status_code=status.HTTP_201_CREATED)
def create_school(body: SchoolCreate, db: DbSession, _: Superadmin) -> School:
    school = School(name=body.name.strip(), org_number=body.org_number)
    db.add(school)
    db.commit()
    return school


@router.get("/schools", response_model=list[SchoolRead])
def list_schools(db: DbSession, _: Superadmin) -> list[School]:
    return list(db.scalars(select(School).order_by(School.name)))


@router.post(
    "/schools/{school_id}/admins", response_model=UserRead, status_code=status.HTTP_201_CREATED
)
def create_school_admin(school_id: UUID, body: AccountCreate, db: DbSession, _: Superadmin) -> User:
    """Skapar en skoladministratör. Lösenordet sätts via inbjudan (B6) eller create_user."""
    if db.get(School, school_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Skolan finns inte")
    user = create_account(
        db, email=body.email, name=body.name, role=UserRole.SCHOOL_ADMIN, school_id=school_id
    )
    db.commit()
    return user
