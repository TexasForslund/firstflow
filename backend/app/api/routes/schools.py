"""En skolas användare. Skoladministratören skapar personal och elever på sin egen skola."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import require_roles, require_same_school
from app.api.routes.invitations import invite_account
from app.api.schemas import UserRead
from app.db.session import DbSession
from app.models.school import School
from app.models.user import User, UserRole
from app.services.accounts import InvitedAccountCreate, create_account

router = APIRouter(prefix="/schools", tags=["schools"])

CanViewSchoolUsers = Annotated[
    User,
    Depends(require_roles(UserRole.SUPERADMIN, UserRole.SCHOOL_ADMIN, UserRole.PRINCIPAL)),
]
CanCreateSchoolUsers = Annotated[
    User, Depends(require_roles(UserRole.SUPERADMIN, UserRole.SCHOOL_ADMIN))
]


def _require_school(db: DbSession, user: User, school_id: UUID) -> None:
    """Samma skola som användaren (eller superadmin), och skolan måste finnas.

    En avstängd skola syns bara för superadmin.
    """
    require_same_school(user, school_id)
    school = db.get(School, school_id)
    if school is None or (not school.is_active and user.role != UserRole.SUPERADMIN):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


class SchoolAccountCreate(InvitedAccountCreate):
    # Skoladmins skapas av superadmin, handledare läggs till per arbetsplats (B3).
    role: Literal["principal", "syv", "teacher", "student"]


@router.get("/{school_id}/users", response_model=list[UserRead])
def list_school_users(
    school_id: UUID, db: DbSession, user: CanViewSchoolUsers, role: UserRole | None = None
) -> list[User]:
    _require_school(db, user, school_id)
    query = select(User).where(User.school_id == school_id).order_by(User.name)
    if role is not None:
        query = query.where(User.role == role)
    return list(db.scalars(query))


@router.post("/{school_id}/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_school_user(
    school_id: UUID, body: SchoolAccountCreate, db: DbSession, user: CanCreateSchoolUsers
) -> User:
    """Skapar ett konto på skolan. Med `send_invite` (standard) får personen ett mejl med en
    länk där hen väljer sitt lösenord."""
    _require_school(db, user, school_id)
    created = create_account(
        db, email=body.email, name=body.name, role=UserRole(body.role), school_id=school_id
    )
    db.commit()
    if body.send_invite:
        invite_account(db, user, created)
    return created


class TeacherProgram(BaseModel):
    program_name: str | None = Field(max_length=200, description="null = inget program")


@router.put("/{school_id}/users/{user_id}/program", response_model=UserRead)
def set_teacher_program(
    school_id: UUID, user_id: UUID, body: TeacherProgram, db: DbSession, user: CanCreateSchoolUsers
) -> User:
    """Skoladmin kopplar en lärare till ett program. Lärarens nya klasser får programmet
    (idé 13, Texas 2026-11-08). En lärare hör till ett program."""
    from app.services import skolverket

    _require_school(db, user, school_id)
    teacher = db.get(User, user_id)
    if teacher is None or teacher.school_id != school_id or teacher.role != UserRole.TEACHER:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")
    if body.program_name is not None:
        try:
            names = {p.name for c in ("gy25", "gy11") for p in skolverket.programs(db, c)}
        except skolverket.SkolverketUnavailable:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Skolverket svarar inte just nu. Försök igen om en stund.",
            ) from None
        if body.program_name not in names:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Programmet finns inte"
            )
    teacher.program_name = body.program_name
    if body.program_name:
        _give_classes_program(db, teacher, body.program_name)
    db.commit()
    return teacher


def _give_classes_program(db: DbSession, teacher: User, program_name: str) -> None:
    """Lärarens klasser som saknar program får det nu. Läroplanen gissas utifrån året i
    klassens namn, om den inte redan är vald."""
    from app.api.routes.syllabus import suggested_curriculum
    from app.models.school_class import SchoolClass, class_teachers
    from app.services import skolverket

    classes = db.scalars(
        select(SchoolClass)
        .join(class_teachers, class_teachers.c.class_id == SchoolClass.id)
        .where(class_teachers.c.teacher_id == teacher.id, SchoolClass.program_code.is_(None))
    ).all()
    for school_class in classes:
        curriculum = school_class.curriculum or suggested_curriculum(school_class.name)
        code = skolverket.program_code_for(db, curriculum, program_name)
        if code:
            school_class.curriculum = curriculum
            school_class.program_code = code


@router.post("/{school_id}/users/{user_id}/invite", response_model=UserRead)
def resend_account_invite(
    school_id: UUID, user_id: UUID, db: DbSession, user: CanCreateSchoolUsers
) -> User:
    """Skickar inbjudan igen, med en ny länk. Den tidigare länken slutar gälla.

    Bara för konton som inte har valt lösenord. Har personen ett lösenord använder hen
    Glömt lösenord (409).
    """
    _require_school(db, user, school_id)
    target = db.get(User, user_id)
    if target is None or target.school_id != school_id or not target.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")
    if target.has_password:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Kontot har redan ett lösenord. Personen kan använda Glömt lösenord.",
        )
    invite_account(db, user, target)
    return target
