"""En elevs sida: namn, skola och klasser."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import require_roles, require_same_school
from app.db.session import DbSession
from app.models.school_class import SchoolClass, class_students, class_teachers
from app.models.user import User, UserRole

router = APIRouter(prefix="/students", tags=["students"])

CanViewStudents = Annotated[
    User,
    Depends(
        require_roles(
            UserRole.SUPERADMIN,
            UserRole.SCHOOL_ADMIN,
            UserRole.PRINCIPAL,
            UserRole.SYV,
            UserRole.TEACHER,
        )
    ),
]


class ClassRef(BaseModel):
    id: UUID
    name: str


class StudentRead(BaseModel):
    id: UUID
    name: str
    email: str
    school_name: str | None
    classes: list[ClassRef]


@router.get("/{student_id}", response_model=StudentRead)
def get_student(student_id: UUID, db: DbSession, user: CanViewStudents) -> StudentRead:
    """Lärare ser elever i klasser hen undervisar. Skolans personal ser skolans elever."""
    student = db.get(User, student_id)
    if student is None or student.role != UserRole.STUDENT:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")
    require_same_school(user, student.school_id)

    classes = db.scalars(
        select(SchoolClass)
        .join(class_students)
        .where(class_students.c.student_id == student.id)
        .order_by(SchoolClass.name)
    ).all()

    if user.role == UserRole.TEACHER:
        taught = set(
            db.scalars(
                select(class_teachers.c.class_id).where(class_teachers.c.teacher_id == user.id)
            )
        )
        classes = [c for c in classes if c.id in taught]
        if not classes:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")

    return StudentRead(
        id=student.id,
        name=student.name,
        email=student.email,
        school_name=student.school_name,
        classes=[ClassRef(id=c.id, name=c.name) for c in classes],
    )
