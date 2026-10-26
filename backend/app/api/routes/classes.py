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
from sqlalchemy import Table, delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles, require_same_school
from app.db.session import DbSession
from app.models.school_class import SchoolClass, class_students, class_teachers, teacher_students
from app.models.user import User, UserRole

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


class AplTerms(BaseModel):
    """APL-villkor för hela klassen. null eller tom lista betyder att det inte är bestämt än."""

    model_config = ConfigDict(from_attributes=True)

    apl_days_per_week: int | None = Field(default=None, ge=1, le=5)
    check_in_required: bool = True
    report_due_weekdays: list[Annotated[int, Field(ge=0, le=4)]] = Field(
        default_factory=list,
        max_length=5,
        description="Vardagar då veckoredovisning ska lämnas: 0 = måndag … 4 = fredag",
    )

    @field_validator("report_due_weekdays")
    @classmethod
    def unique_sorted(cls, days: list[int]) -> list[int]:
        return sorted(set(days))


class ClassDetail(BaseModel):
    id: UUID
    name: str
    school_id: UUID
    teachers: list[PersonRead]
    students: list[PersonRead]
    apl_terms: AplTerms


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
        apl_terms=AplTerms.model_validate(school_class),
    )


def get_accessible_class(db: DbSession, user: User, class_id: UUID) -> SchoolClass:
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
    return _detail(get_accessible_class(db, user, class_id))


class StudentLink(BaseModel):
    student_id: UUID
    move: bool = Field(
        default=False,
        description="Flytta eleven hit om hen går i en annan klass. Annars svarar det 409.",
    )


@router.post("/{class_id}/students", response_model=PersonRead, status_code=status.HTTP_201_CREATED)
def add_student(class_id: UUID, body: StudentLink, db: DbSession, user: CanEditClasses) -> User:
    """Lägger en befintlig elev i klassen.

    Eleverna läggs in i systemet av skoladmin (POST /api/students). Läraren kan bara lägga
    elever som är kopplade till hen. Skoladmin kan lägga alla aktiva elever på skolan.
    """
    school_class = get_accessible_class(db, user, class_id)
    student = db.get(User, body.student_id)
    if (
        student is None
        or student.role != UserRole.STUDENT
        or student.school_id != school_class.school_id
        or not student.is_active
    ):
        raise _not_found()
    if user.role == UserRole.TEACHER:
        linked = db.scalar(
            select(teacher_students.c.student_id).where(
                teacher_students.c.teacher_id == user.id,
                teacher_students.c.student_id == student.id,
            )
        )
        if linked is None:
            raise _not_found()
    # En elev går i en klass (Texas, 2026-10-26). Går eleven i en annan klass flyttas hen,
    # men bara när anropet ber om det, så att läraren hinner bekräfta.
    current = db.scalar(
        select(SchoolClass)
        .join(class_students, class_students.c.class_id == SchoolClass.id)
        .where(class_students.c.student_id == student.id)
    )
    if current is not None and current.id != school_class.id:
        if not body.move:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail=f"{student.name} går i {current.name}. En elev kan bara gå i en klass.",
            )
        db.execute(
            delete(class_students).where(
                class_students.c.class_id == current.id, class_students.c.student_id == student.id
            )
        )
    _link(db, class_students, school_class.id, "student_id", student.id)
    db.commit()
    return student


@router.delete("/{class_id}/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_student(
    class_id: UUID, student_id: UUID, db: DbSession, user: CanEditClasses
) -> Response:
    """Tar bort eleven ur klassen. Elevkontot finns kvar."""
    school_class = get_accessible_class(db, user, class_id)
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
    school_class = get_accessible_class(db, user, class_id)
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
    school_class = get_accessible_class(db, user, class_id)
    teacher = next((t for t in school_class.teachers if t.id == teacher_id), None)
    if teacher is None:
        raise _not_found()
    school_class.teachers.remove(teacher)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{class_id}/apl-terms", response_model=ClassDetail)
def set_apl_terms(
    class_id: UUID, body: AplTerms, db: DbSession, user: CanEditClasses
) -> ClassDetail:
    """Sätter klassens APL-villkor. Läraren för klassen eller skoladmin. Alla fält skrivs över."""
    school_class = get_accessible_class(db, user, class_id)
    for field, value in body.model_dump().items():
        setattr(school_class, field, value)
    db.commit()
    return _detail(school_class)
