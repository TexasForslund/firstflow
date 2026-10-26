"""Elevregistret.

Skoladmin lägger in eleverna, väljer deras lärare och kan placera dem i klasser. Läraren ser
eleverna som är kopplade till hen och lägger dem i sina klasser.

Behörighet:
- Skoladmin: alla elever på skolan, skapar elever och sätter deras lärare.
- Rektor och SYV: läser skolans elever.
- Lärare: elever som är kopplade till hen, eller som går i en klass hen undervisar.
- Superadmin: läser enskilda elever.
Allt annat svarar 404. Avstängda elever svarar 404.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import aliased, selectinload

from app.api.deps import require_roles, require_same_school
from app.api.routes.placements import PlacementRead, placement_read
from app.core import time
from app.db.session import DbSession
from app.models.placement import Placement, Workplace
from app.models.project import project_students
from app.models.report import Report, ReportStatus
from app.models.school_class import SchoolClass, class_students, class_teachers, teacher_students
from app.models.user import User, UserRole
from app.services.accounts import AccountCreate, create_account

router = APIRouter(prefix="/students", tags=["students"])

Student = aliased(User)

CanViewStudent = Annotated[
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
CanListStudents = Annotated[
    User,
    Depends(
        require_roles(UserRole.SCHOOL_ADMIN, UserRole.PRINCIPAL, UserRole.SYV, UserRole.TEACHER)
    ),
]
SchoolAdmin = Annotated[User, Depends(require_roles(UserRole.SCHOOL_ADMIN))]


class Ref(BaseModel):
    id: UUID
    name: str


class StudentRead(BaseModel):
    id: UUID
    name: str
    email: str
    school_name: str | None
    classes: list[Ref]
    teachers: list[Ref]
    workplace: Ref | None = Field(description="Pågående eller nästa praktikplats")
    report_count: int = Field(description="Inskickade veckoredovisningar")
    project_count: int = Field(description="Projekt som eleven är med i")


class StudentCreate(AccountCreate):
    teacher_ids: list[UUID] = Field(default_factory=list, max_length=20)
    # En elev går i en klass (Texas, 2026-10-26). Listan har högst ett id.
    class_ids: list[UUID] = Field(default_factory=list, max_length=1)


class TeachersSet(BaseModel):
    teacher_ids: list[UUID] = Field(max_length=20)


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


def _taught_class_ids(db: DbSession, teacher: User) -> set[UUID]:
    return set(
        db.scalars(
            select(class_teachers.c.class_id).where(class_teachers.c.teacher_id == teacher.id)
        )
    )


def _linked_student_ids(db: DbSession, teacher: User) -> set[UUID]:
    return set(
        db.scalars(
            select(teacher_students.c.student_id).where(teacher_students.c.teacher_id == teacher.id)
        )
    )


def _describe(db: DbSession, students: list[User]) -> list[StudentRead]:
    """Elever med klasser och aktiva lärare, hämtat i två frågor."""
    ids = [s.id for s in students]
    classes: dict[UUID, list[Ref]] = {i: [] for i in ids}
    for student_id, class_id, name in db.execute(
        select(class_students.c.student_id, SchoolClass.id, SchoolClass.name)
        .join(SchoolClass, SchoolClass.id == class_students.c.class_id)
        .where(class_students.c.student_id.in_(ids))
        .order_by(SchoolClass.name)
    ):
        classes[student_id].append(Ref(id=class_id, name=name))
    teachers: dict[UUID, list[Ref]] = {i: [] for i in ids}
    for student_id, teacher_id, name in db.execute(
        select(teacher_students.c.student_id, User.id, User.name)
        .join(User, User.id == teacher_students.c.teacher_id)
        # Samma skola som eleven: en lärare som bytt skola ska inte synas här.
        .join(Student, Student.id == teacher_students.c.student_id)
        .where(
            teacher_students.c.student_id.in_(ids),
            User.is_active,
            User.school_id == Student.school_id,
        )
        .order_by(User.name)
    ):
        teachers[student_id].append(Ref(id=teacher_id, name=name))
    # Pågående praktikplats, annars den närmaste kommande.
    today = time.today()
    workplaces: dict[UUID, Ref] = {}
    for student_id, workplace_id, name in db.execute(
        select(Placement.student_id, Workplace.id, Workplace.name)
        .join(Workplace, Workplace.id == Placement.workplace_id)
        .where(Placement.student_id.in_(ids), Placement.end_date >= today)
        .order_by(Placement.start_date.desc())
    ):
        workplaces[student_id] = Ref(id=workplace_id, name=name)
    report_counts = dict(
        db.execute(
            select(Report.student_id, func.count(Report.id))
            .where(Report.student_id.in_(ids), Report.status == ReportStatus.SUBMITTED)
            .group_by(Report.student_id)
        ).all()
    )
    project_counts = dict(
        db.execute(
            select(project_students.c.student_id, func.count())
            .where(project_students.c.student_id.in_(ids))
            .group_by(project_students.c.student_id)
        ).all()
    )
    return [
        StudentRead(
            id=s.id,
            name=s.name,
            email=s.email,
            school_name=s.school_name,
            classes=classes[s.id],
            teachers=teachers[s.id],
            workplace=workplaces.get(s.id),
            report_count=report_counts.get(s.id, 0),
            project_count=project_counts.get(s.id, 0),
        )
        for s in students
    ]


def get_student_for(db: DbSession, user: User, student_id: UUID) -> User:
    """Eleven om användaren får se hen, annars 404."""
    student = db.get(User, student_id)
    if student is None or student.role != UserRole.STUDENT or not student.is_active:
        raise _not_found()
    require_same_school(user, student.school_id)
    if user.role == UserRole.TEACHER:
        linked = student.id in _linked_student_ids(db, user)
        in_my_class = db.scalar(
            select(class_students.c.class_id).where(
                class_students.c.student_id == student.id,
                class_students.c.class_id.in_(_taught_class_ids(db, user)),
            )
        )
        if not linked and in_my_class is None:
            raise _not_found()
    return student


def _school_teachers(db: DbSession, school_id: UUID, ids: list[UUID]) -> list[User]:
    """Aktiva lärare på skolan med de angivna id:na. 422 om någon inte finns där."""
    if not ids:
        return []
    teachers = list(
        db.scalars(
            select(User).where(
                User.id.in_(ids),
                User.role == UserRole.TEACHER,
                User.school_id == school_id,
                User.is_active,
            )
        )
    )
    if len(teachers) != len(set(ids)):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="En vald lärare finns inte på skolan"
        )
    return teachers


@router.get("", response_model=list[StudentRead])
def list_students(
    db: DbSession,
    user: CanListStudents,
    q: Annotated[str | None, Query(max_length=100, description="Sök på namn eller e-post")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[StudentRead]:
    """Läraren får sina kopplade elever. Skolans personal får skolans alla elever."""
    query = (
        select(User)
        .where(
            User.role == UserRole.STUDENT,
            User.school_id == user.school_id,
            User.is_active,
        )
        .order_by(User.name)
        .limit(limit)
    )
    if user.role == UserRole.TEACHER:
        query = query.join(teacher_students, teacher_students.c.student_id == User.id).where(
            teacher_students.c.teacher_id == user.id
        )
    if q and q.strip():
        # % och _ i söktexten ska matcha sig själva, inte vara jokertecken.
        term = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{term}%"
        query = query.where(
            or_(User.name.ilike(pattern, escape="\\"), User.email.ilike(pattern, escape="\\"))
        )
    return _describe(db, list(db.scalars(query)))


@router.post("", response_model=StudentRead, status_code=status.HTTP_201_CREATED)
def create_student(body: StudentCreate, db: DbSession, user: SchoolAdmin) -> StudentRead:
    """Skapar en elev på skolan, med lärare och klasser. Lösenordet sätts via inbjudan (B6)."""
    teachers = _school_teachers(db, user.school_id, body.teacher_ids)
    classes = []
    if body.class_ids:
        classes = list(
            db.scalars(
                select(SchoolClass).where(
                    SchoolClass.id.in_(body.class_ids), SchoolClass.school_id == user.school_id
                )
            )
        )
        if len(classes) != len(set(body.class_ids)):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, detail="En vald klass finns inte på skolan"
            )
    student = create_account(
        db, email=body.email, name=body.name, role=UserRole.STUDENT, school_id=user.school_id
    )
    for teacher in teachers:
        db.execute(
            insert(teacher_students)
            .values(teacher_id=teacher.id, student_id=student.id)
            .on_conflict_do_nothing()
        )
    for school_class in classes:
        db.execute(
            insert(class_students)
            .values(class_id=school_class.id, student_id=student.id)
            .on_conflict_do_nothing()
        )
    db.commit()
    return _describe(db, [student])[0]


@router.get("/{student_id}", response_model=StudentRead)
def get_student(student_id: UUID, db: DbSession, user: CanViewStudent) -> StudentRead:
    student = get_student_for(db, user, student_id)
    described = _describe(db, [student])[0]
    if user.role == UserRole.TEACHER and student.id not in _linked_student_ids(db, user):
        # Läraren undervisar eleven men ansvarar inte för hen: visa bara lärarens klasser.
        taught = _taught_class_ids(db, user)
        described.classes = [c for c in described.classes if c.id in taught]
    return described


@router.put("/{student_id}/teachers", response_model=StudentRead)
def set_teachers(
    student_id: UUID, body: TeachersSet, db: DbSession, user: SchoolAdmin
) -> StudentRead:
    """Sätter elevens lärare. Listan ersätter de tidigare."""
    student = get_student_for(db, user, student_id)
    teachers = _school_teachers(db, student.school_id, body.teacher_ids)
    db.execute(teacher_students.delete().where(teacher_students.c.student_id == student.id))
    for teacher in teachers:
        db.execute(
            insert(teacher_students)
            .values(teacher_id=teacher.id, student_id=student.id)
            .on_conflict_do_nothing()
        )
    db.commit()
    return _describe(db, [student])[0]


@router.get("/{student_id}/placements", response_model=list[PlacementRead])
def student_placements(
    student_id: UUID, db: DbSession, user: CanViewStudent
) -> list[PlacementRead]:
    """Elevens praktikplatser, senaste först. Samma behörighet som elevsidan."""
    student = get_student_for(db, user, student_id)
    placements = db.scalars(
        select(Placement)
        .where(Placement.student_id == student.id)
        .options(
            selectinload(Placement.student),
            selectinload(Placement.workplace),
            selectinload(Placement.supervisor),
        )
        .order_by(Placement.start_date.desc())
    )
    return [placement_read(p) for p in placements]
