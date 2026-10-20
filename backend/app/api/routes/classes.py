"""Klasser och deras elever och lärare.

Behörighet:
- Lärare ser och ändrar klasser hen undervisar i.
- Skoladmin ser och ändrar alla klasser på sin skola, och kopplar lärare.
- Rektor ser alla klasser på sin skola.
- Superadmin ser alla klasser men ändrar inget. Superadmin förvaltar skolor, inte klasser.
Avstängda konton visas inte i klasserna och kan inte kopplas.
En klass som användaren inte har tillgång till svarar 404, oavsett om den finns.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Table, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

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
CanEditClasses = Annotated[User, Depends(require_roles(UserRole.SCHOOL_ADMIN, UserRole.TEACHER))]
CanAssignTeachers = Annotated[User, Depends(require_roles(UserRole.SCHOOL_ADMIN))]


def _not_found() -> HTTPException:
    # Ett nytt undantag varje gång. Ett återanvänt undantag samlar på sig tracebacks
    # och håller kvar gamla anrops data i minnet.
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


def _class_name_taken(name: str) -> HTTPException:
    return HTTPException(
        status.HTTP_409_CONFLICT, detail=f"Det finns redan en klass som heter {name}"
    )


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


def _active(people: list[User]) -> list[PersonRead]:
    return [PersonRead.model_validate(p) for p in people if p.is_active]


def _detail(school_class: SchoolClass) -> ClassDetail:
    return ClassDetail(
        id=school_class.id,
        name=school_class.name,
        school_id=school_class.school_id,
        teachers=_active(school_class.teachers),
        students=_active(school_class.students),
    )


def _get_class(db: DbSession, user: User, class_id: UUID) -> SchoolClass:
    """Klassen om användaren får se den, annars 404. Rollen avgör om hen får ändra den."""
    school_class = db.get(SchoolClass, class_id)
    if school_class is None:
        raise _not_found()
    require_same_school(user, school_class.school_id)
    if user.role == UserRole.TEACHER and not _teaches(user, school_class):
        raise _not_found()
    return school_class


def _link(db: DbSession, table: Table, class_id: UUID, column: str, user_id: UUID) -> None:
    """Kopplar en användare till klassen. Finns kopplingen redan händer inget."""
    db.execute(
        insert(table).values({"class_id": class_id, column: user_id}).on_conflict_do_nothing()
    )
    # Kopplingen skrevs direkt i tabellen, så klassens listor måste läsas om.
    db.expire_all()


@router.get("", response_model=list[ClassSummary])
def list_classes(db: DbSession, user: CanViewClasses) -> list[ClassSummary]:
    """Lärare får sina egna klasser. Skoladmin och rektor får skolans alla klasser."""
    query = (
        select(SchoolClass).options(selectinload(SchoolClass.teachers)).order_by(SchoolClass.name)
    )
    if user.role != UserRole.SUPERADMIN:
        query = query.where(SchoolClass.school_id == user.school_id)
    if user.role == UserRole.TEACHER:
        query = query.join(class_teachers).where(class_teachers.c.teacher_id == user.id)
    classes = db.scalars(query).unique().all()

    counts = dict(
        db.execute(
            select(class_students.c.class_id, func.count())
            .join(User, User.id == class_students.c.student_id)
            .where(class_students.c.class_id.in_([c.id for c in classes]), User.is_active)
            .group_by(class_students.c.class_id)
        ).all()
    )
    return [
        ClassSummary(
            id=c.id,
            name=c.name,
            student_count=counts.get(c.id, 0),
            teacher_names=[t.name for t in c.teachers if t.is_active],
        )
        for c in classes
    ]


@router.post("", response_model=ClassDetail, status_code=status.HTTP_201_CREATED)
def create_class(body: ClassCreate, db: DbSession, user: CanEditClasses) -> ClassDetail:
    """Skapar en klass på användarens skola. En lärare kopplas automatiskt till klassen."""
    duplicate = db.scalar(
        select(SchoolClass.id).where(
            SchoolClass.school_id == user.school_id, SchoolClass.name == body.name
        )
    )
    if duplicate:
        raise _class_name_taken(body.name)
    school_class = SchoolClass(school_id=user.school_id, name=body.name)
    if user.role == UserRole.TEACHER:
        school_class.teachers.append(user)
    savepoint = db.begin_nested()
    db.add(school_class)
    try:
        db.flush()
    except IntegrityError:  # två samtidiga anrop med samma namn
        savepoint.rollback()
        raise _class_name_taken(body.name) from None
    savepoint.commit()
    db.commit()
    return _detail(school_class)


@router.get("/{class_id}", response_model=ClassDetail)
def get_class(class_id: UUID, db: DbSession, user: CanViewClasses) -> ClassDetail:
    return _detail(_get_class(db, user, class_id))


@router.post("/{class_id}/students", response_model=PersonRead, status_code=status.HTTP_201_CREATED)
def add_student(class_id: UUID, body: AccountCreate, db: DbSession, user: CanEditClasses) -> User:
    """Lägger till en elev i klassen.

    Finns e-postadressen redan som aktiv elev på samma skola kopplas den eleven. Annars skapas
    ett nytt elevkonto utan lösenord (sätts via inbjudan i B6). Alla andra konton med samma
    e-post, även avstängda, ger 409.
    """
    school_class = _get_class(db, user, class_id)
    existing = db.scalar(select(User).where(User.email == body.email))
    if existing is not None:
        if (
            existing.role != UserRole.STUDENT
            or existing.school_id != school_class.school_id
            or not existing.is_active
        ):
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
    _link(db, class_students, school_class.id, "student_id", student.id)
    db.commit()
    return student


@router.delete("/{class_id}/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_student(
    class_id: UUID, student_id: UUID, db: DbSession, user: CanEditClasses
) -> Response:
    """Tar bort eleven ur klassen. Elevkontot finns kvar."""
    school_class = _get_class(db, user, class_id)
    student = next((s for s in school_class.students if s.id == student_id), None)
    if student is None:
        raise _not_found()
    school_class.students.remove(student)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{class_id}/teachers", response_model=PersonRead, status_code=status.HTTP_201_CREATED)
def assign_teacher(
    class_id: UUID, body: TeacherAssign, db: DbSession, user: CanAssignTeachers
) -> User:
    """Kopplar en aktiv lärare på samma skola till klassen."""
    school_class = _get_class(db, user, class_id)
    teacher = db.get(User, body.teacher_id)
    if (
        teacher is None
        or teacher.role != UserRole.TEACHER
        or teacher.school_id != school_class.school_id
        or not teacher.is_active
    ):
        raise _not_found()
    _link(db, class_teachers, school_class.id, "teacher_id", teacher.id)
    db.commit()
    return teacher


@router.delete("/{class_id}/teachers/{teacher_id}", status_code=status.HTTP_204_NO_CONTENT)
def unassign_teacher(
    class_id: UUID, teacher_id: UUID, db: DbSession, user: CanAssignTeachers
) -> Response:
    school_class = _get_class(db, user, class_id)
    teacher = next((t for t in school_class.teachers if t.id == teacher_id), None)
    if teacher is None:
        raise _not_found()
    school_class.teachers.remove(teacher)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
