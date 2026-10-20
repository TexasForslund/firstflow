"""Klasser och deras elever och lärare.

Behörighet:
- Lärare ser och ändrar klasser hen undervisar i.
- Skoladmin ser och ändrar alla klasser på sin skola, och kopplar lärare.
- Rektor ser alla klasser på sin skola.
- Superadmin ser alla klasser.
En klass som användaren inte har tillgång till svarar 404, oavsett om den finns.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select

from app.api.deps import require_roles, require_same_school
from app.db.session import DbSession
from app.models.school_class import SchoolClass, class_students, class_teachers
from app.models.user import User, UserRole
from app.services.accounts import AccountCreate, create_account

router = APIRouter(prefix="/classes", tags=["classes"])

CanViewClasses = Annotated[
    User,
    Depends(
        require_roles(
            UserRole.SUPERADMIN, UserRole.SCHOOL_ADMIN, UserRole.PRINCIPAL, UserRole.TEACHER
        )
    ),
]
CanEditClasses = Annotated[
    User, Depends(require_roles(UserRole.SUPERADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER))
]
CanAssignTeachers = Annotated[
    User, Depends(require_roles(UserRole.SUPERADMIN, UserRole.SCHOOL_ADMIN))
]

NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


class PersonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: str


class ClassSummary(BaseModel):
    id: UUID
    name: str
    student_count: int
    teacher_names: list[str]


class ClassDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    school_id: UUID
    teachers: list[PersonRead]
    students: list[PersonRead]


class ClassCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Klassen måste ha ett namn")
        return name


class TeacherAssign(BaseModel):
    teacher_id: UUID


def _teaches(user: User, school_class: SchoolClass) -> bool:
    return any(t.id == user.id for t in school_class.teachers)


def _get_class(db: DbSession, user: User, class_id: UUID, *, edit: bool = False) -> SchoolClass:
    """Klassen om användaren får se (eller ändra) den, annars 404."""
    school_class = db.get(SchoolClass, class_id)
    if school_class is None:
        raise NOT_FOUND
    require_same_school(user, school_class.school_id)
    if user.role == UserRole.TEACHER and not _teaches(user, school_class):
        raise NOT_FOUND
    if edit and user.role == UserRole.PRINCIPAL:
        raise NOT_FOUND
    return school_class


@router.get("", response_model=list[ClassSummary])
def list_classes(db: DbSession, user: CanViewClasses) -> list[ClassSummary]:
    """Lärare får sina egna klasser. Skoladmin och rektor får skolans alla klasser."""
    query = select(SchoolClass).order_by(SchoolClass.name)
    if user.role == UserRole.TEACHER:
        query = query.join(class_teachers).where(class_teachers.c.teacher_id == user.id)
    elif user.role != UserRole.SUPERADMIN:
        query = query.where(SchoolClass.school_id == user.school_id)
    classes = db.scalars(query).unique().all()

    counts = dict(
        db.execute(
            select(class_students.c.class_id, func.count())
            .where(class_students.c.class_id.in_([c.id for c in classes]))
            .group_by(class_students.c.class_id)
        ).all()
    )
    return [
        ClassSummary(
            id=c.id,
            name=c.name,
            student_count=counts.get(c.id, 0),
            teacher_names=[t.name for t in c.teachers],
        )
        for c in classes
    ]


@router.post("", response_model=ClassDetail, status_code=status.HTTP_201_CREATED)
def create_class(body: ClassCreate, db: DbSession, user: CanEditClasses) -> SchoolClass:
    """Skapar en klass på användarens skola. En lärare kopplas automatiskt till klassen."""
    if user.school_id is None:  # superadmin har ingen skola att skapa klassen på
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Du saknar behörighet")
    duplicate = db.scalar(
        select(SchoolClass.id).where(
            SchoolClass.school_id == user.school_id, SchoolClass.name == body.name
        )
    )
    if duplicate:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail=f"Det finns redan en klass som heter {body.name}"
        )
    school_class = SchoolClass(school_id=user.school_id, name=body.name)
    if user.role == UserRole.TEACHER:
        school_class.teachers.append(user)
    db.add(school_class)
    db.commit()
    return school_class


@router.get("/{class_id}", response_model=ClassDetail)
def get_class(class_id: UUID, db: DbSession, user: CanViewClasses) -> SchoolClass:
    return _get_class(db, user, class_id)


@router.post("/{class_id}/students", response_model=PersonRead, status_code=status.HTTP_201_CREATED)
def add_student(class_id: UUID, body: AccountCreate, db: DbSession, user: CanEditClasses) -> User:
    """Lägger till en elev i klassen.

    Finns e-postadressen redan som elev på samma skola kopplas den eleven. Annars skapas ett
    nytt elevkonto utan lösenord (sätts via inbjudan i B6).
    """
    school_class = _get_class(db, user, class_id, edit=True)
    existing = db.scalar(select(User).where(User.email == body.email))
    if existing is not None:
        if existing.role != UserRole.STUDENT or existing.school_id != school_class.school_id:
            raise HTTPException(
                status.HTTP_409_CONFLICT, detail="Det finns redan ett konto med den e-postadressen"
            )
        student = existing
    else:
        student = create_account(
            db,
            email=body.email,
            name=body.name,
            role=UserRole.STUDENT,
            school_id=school_class.school_id,
        )
    if all(s.id != student.id for s in school_class.students):
        school_class.students.append(student)
    db.commit()
    return student


@router.delete("/{class_id}/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_student(
    class_id: UUID, student_id: UUID, db: DbSession, user: CanEditClasses
) -> Response:
    """Tar bort eleven ur klassen. Elevkontot finns kvar."""
    school_class = _get_class(db, user, class_id, edit=True)
    student = next((s for s in school_class.students if s.id == student_id), None)
    if student is None:
        raise NOT_FOUND
    school_class.students.remove(student)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{class_id}/teachers", response_model=PersonRead, status_code=status.HTTP_201_CREATED)
def assign_teacher(
    class_id: UUID, body: TeacherAssign, db: DbSession, user: CanAssignTeachers
) -> User:
    """Kopplar en lärare på samma skola till klassen."""
    school_class = _get_class(db, user, class_id, edit=True)
    teacher = db.get(User, body.teacher_id)
    if (
        teacher is None
        or teacher.role != UserRole.TEACHER
        or teacher.school_id != school_class.school_id
    ):
        raise NOT_FOUND
    if not _teaches(teacher, school_class):
        school_class.teachers.append(teacher)
    db.commit()
    return teacher


@router.delete("/{class_id}/teachers/{teacher_id}", status_code=status.HTTP_204_NO_CONTENT)
def unassign_teacher(
    class_id: UUID, teacher_id: UUID, db: DbSession, user: CanAssignTeachers
) -> Response:
    school_class = _get_class(db, user, class_id, edit=True)
    teacher = next((t for t in school_class.teachers if t.id == teacher_id), None)
    if teacher is None:
        raise NOT_FOUND
    school_class.teachers.remove(teacher)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
