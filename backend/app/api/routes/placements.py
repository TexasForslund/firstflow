"""Praktikplatser (B3): arbetsplatser, handledare och elevernas placeringar.

Läraren lägger in arbetsplatser på skolan, lägger till handledare på arbetsplatsen och
placerar sina elever där under en period. Handledaren bjuds in per arbetsplats: kontot skapas
utan lösenord och lösenordet sätts via inbjudan (B6).

Behörighet:
- Lärare och skoladmin ser och lägger in skolans arbetsplatser och handledare. Rektor läser.
- Lärare placerar elever som går i en klass hen undervisar. Skoladmin placerar skolans elever.
- Klassens placeringar: samma som klassvyn (lärare för klassen, skoladmin, rektor, superadmin).
- Eleven ser sina egna placeringar. Handledaren ser elever som hen har just nu.
Arbetsplatser, elever och placeringar som användaren inte har tillgång till svarar 404.
"""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles, require_same_school
from app.api.routes.classes import CanViewClasses, get_accessible_class
from app.core import time
from app.core.security import normalize_email
from app.db.session import DbSession
from app.models.attendance import Attendance
from app.models.placement import Placement, Workplace, workplace_supervisors
from app.models.school_class import class_students, class_teachers
from app.models.user import User, UserRole
from app.services.accounts import AccountCreate, create_account

workplace_router = APIRouter(prefix="/workplaces", tags=["placements"])
router = APIRouter(prefix="/placements", tags=["placements"])
class_router = APIRouter(prefix="/classes/{class_id}/placements", tags=["placements"])
me_router = APIRouter(prefix="/me/placements", tags=["placements"])
supervisor_router = APIRouter(prefix="/supervisor", tags=["placements"])

CanViewWorkplaces = Annotated[
    User,
    Depends(require_roles(UserRole.SCHOOL_ADMIN, UserRole.PRINCIPAL, UserRole.TEACHER)),
]
CanEditPlacements = Annotated[User, Depends(require_roles(UserRole.SCHOOL_ADMIN, UserRole.TEACHER))]
SchoolAdmin = Annotated[User, Depends(require_roles(UserRole.SCHOOL_ADMIN))]
Student = Annotated[User, Depends(require_roles(UserRole.STUDENT))]
Supervisor = Annotated[User, Depends(require_roles(UserRole.SUPERVISOR))]


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


class SupervisorRead(BaseModel):
    id: UUID
    name: str
    email: str


class WorkplaceRead(BaseModel):
    id: UUID
    name: str
    address: str | None
    industry: str | None
    description: str | None
    supervisors: list[SupervisorRead]


class WorkplaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=300)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Arbetsplatsen måste ha ett namn")
        return name

    @field_validator("address")
    @classmethod
    def strip_address(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class Ref(BaseModel):
    id: UUID
    name: str


class WorkplaceRef(BaseModel):
    id: UUID
    name: str
    address: str | None


class PlacementCreate(BaseModel):
    student_id: UUID
    workplace_id: UUID
    supervisor_id: UUID
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def dates_in_order(self) -> "PlacementCreate":
        if self.end_date < self.start_date:
            raise ValueError("Slutdatum kan inte vara före startdatum")
        return self


class PlacementRead(BaseModel):
    """En placering som läraren ser, t.ex. i klassvyns elevlista."""

    id: UUID
    student: Ref
    workplace: WorkplaceRef
    supervisor: SupervisorRead
    start_date: date
    end_date: date


class MyPlacement(BaseModel):
    """Elevens egen placering. Handledarens namn räcker för eleven."""

    id: UUID
    workplace: WorkplaceRef
    supervisor_name: str
    start_date: date
    end_date: date


class SupervisedStudent(BaseModel):
    """En elev som handledaren har just nu."""

    placement_id: UUID
    student: Ref
    workplace: WorkplaceRef
    start_date: date
    end_date: date


def _active(people: list[User]) -> list[SupervisorRead]:
    return [SupervisorRead(id=p.id, name=p.name, email=p.email) for p in people if p.is_active]


def _workplace_read(workplace: Workplace) -> WorkplaceRead:
    return WorkplaceRead(
        id=workplace.id,
        name=workplace.name,
        address=workplace.address,
        industry=workplace.industry,
        description=workplace.description,
        supervisors=_active(workplace.supervisors),
    )


def _workplace_ref(workplace: Workplace) -> WorkplaceRef:
    return WorkplaceRef(id=workplace.id, name=workplace.name, address=workplace.address)


def placement_read(placement: Placement) -> PlacementRead:
    supervisor = placement.supervisor
    return PlacementRead(
        id=placement.id,
        student=Ref(id=placement.student.id, name=placement.student.name),
        workplace=_workplace_ref(placement.workplace),
        supervisor=SupervisorRead(id=supervisor.id, name=supervisor.name, email=supervisor.email),
        start_date=placement.start_date,
        end_date=placement.end_date,
    )


def _visible_to_teacher(teacher: User):  # noqa: ANN202
    """Läraren ser företag hen har bjudit in, och företag utan ägare (t.ex. från skoladmin)."""
    return or_(Workplace.owner_teacher_id == teacher.id, Workplace.owner_teacher_id.is_(None))


def _get_workplace(db: DbSession, user: User, workplace_id: UUID) -> Workplace:
    workplace = db.get(Workplace, workplace_id)
    if workplace is None:
        raise _not_found()
    require_same_school(user, workplace.school_id)
    if user.role == UserRole.TEACHER and workplace.owner_teacher_id not in (None, user.id):
        raise _not_found()
    return workplace


def _teaches_student(db: DbSession, teacher: User, student_id: UUID) -> bool:
    """Om eleven går i en klass som läraren undervisar."""
    return (
        db.scalar(
            select(class_students.c.class_id)
            .join(class_teachers, class_teachers.c.class_id == class_students.c.class_id)
            .where(
                class_students.c.student_id == student_id,
                class_teachers.c.teacher_id == teacher.id,
            )
            .limit(1)
        )
        is not None
    )


def _require_student_access(db: DbSession, user: User, student_id: UUID) -> User:
    """Eleven om användaren får placera hen, annars 404."""
    student = db.get(User, student_id)
    if student is None or student.role != UserRole.STUDENT or not student.is_active:
        raise _not_found()
    require_same_school(user, student.school_id)
    if user.role == UserRole.TEACHER and not _teaches_student(db, user, student.id):
        raise _not_found()
    return student


@workplace_router.get("", response_model=list[WorkplaceRead])
def list_workplaces(db: DbSession, user: CanViewWorkplaces) -> list[WorkplaceRead]:
    """Skolans arbetsplatser med sina handledare."""
    query = select(Workplace).where(Workplace.school_id == user.school_id)
    if user.role == UserRole.TEACHER:
        query = query.where(_visible_to_teacher(user))
    workplaces = db.scalars(
        query.options(selectinload(Workplace.supervisors)).order_by(Workplace.name)
    )
    return [_workplace_read(w) for w in workplaces]


@workplace_router.post("", response_model=WorkplaceRead, status_code=status.HTTP_201_CREATED)
def create_workplace(body: WorkplaceCreate, db: DbSession, user: SchoolAdmin) -> WorkplaceRead:
    workplace = Workplace(school_id=user.school_id, name=body.name, address=body.address)
    db.add(workplace)
    db.commit()
    return _workplace_read(workplace)


@workplace_router.post(
    "/{workplace_id}/supervisors",
    response_model=WorkplaceRead,
    status_code=status.HTTP_201_CREATED,
)
def add_supervisor(
    workplace_id: UUID, body: AccountCreate, db: DbSession, user: SchoolAdmin
) -> WorkplaceRead:
    """Lägger till en handledare på arbetsplatsen.

    Finns det redan en handledare med e-postadressen kopplas hen till arbetsplatsen, eftersom
    samma handledare kan ta emot elever från flera skolor. Namnet i anropet används då inte.
    Annars skapas ett handledarkonto utan lösenord, som sätts via inbjudan (B6).
    En annan roll med samma e-postadress svarar 409.
    """
    workplace = _get_workplace(db, user, workplace_id)
    supervisor = db.scalar(
        select(User).where(
            User.email == normalize_email(body.email),
            User.role == UserRole.SUPERVISOR,
            User.is_active,
        )
    )
    if supervisor is None:
        supervisor = create_account(
            db, email=body.email, name=body.name, role=UserRole.SUPERVISOR, school_id=None
        )
    db.execute(
        insert(workplace_supervisors)
        .values(workplace_id=workplace.id, supervisor_id=supervisor.id)
        .on_conflict_do_nothing()
    )
    db.commit()
    db.refresh(workplace)
    return _workplace_read(workplace)


@router.post("", response_model=PlacementRead, status_code=status.HTTP_201_CREATED)
def create_placement(
    body: PlacementCreate, db: DbSession, user: CanEditPlacements
) -> PlacementRead:
    """Placerar en elev på en arbetsplats med en handledare under en period.

    Handledaren måste finnas på arbetsplatsen. Perioden får inte överlappa elevens andra
    placeringar (409).
    """
    student = _require_student_access(db, user, body.student_id)
    workplace = _get_workplace(db, user, body.workplace_id)
    if workplace.school_id != student.school_id:
        raise _not_found()
    supervisor = next((s for s in workplace.supervisors if s.id == body.supervisor_id), None)
    if supervisor is None or not supervisor.is_active:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Handledaren finns inte på arbetsplatsen",
        )
    # Lås eleven så att två samtidiga anrop inte kan skapa överlappande placeringar.
    db.execute(select(User.id).where(User.id == student.id).with_for_update())
    overlapping = db.scalar(
        select(Placement.id).where(
            Placement.student_id == student.id,
            Placement.start_date <= body.end_date,
            Placement.end_date >= body.start_date,
        )
    )
    if overlapping:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Eleven har redan en placering under en del av perioden",
        )
    placement = Placement(
        student=student,
        workplace=workplace,
        supervisor=supervisor,
        start_date=body.start_date,
        end_date=body.end_date,
    )
    db.add(placement)
    db.commit()
    return placement_read(placement)


@router.delete("/{placement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_placement(placement_id: UUID, db: DbSession, user: CanEditPlacements) -> Response:
    """Tar bort en placering, t.ex. om den blev fel. Samma behörighet som att skapa den."""
    placement = db.get(Placement, placement_id)
    if placement is None:
        raise _not_found()
    _require_student_access(db, user, placement.student_id)
    if db.scalar(select(Attendance.id).where(Attendance.placement_id == placement.id).limit(1)):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Eleven har närvaro registrerad på placeringen. Den går inte att ta bort.",
        )
    db.delete(placement)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@class_router.get("", response_model=list[PlacementRead])
def list_class_placements(
    class_id: UUID, db: DbSession, user: CanViewClasses
) -> list[PlacementRead]:
    """Placeringarna för klassens aktiva elever, per elev i datumordning."""
    school_class = get_accessible_class(db, user, class_id)
    placements = db.scalars(
        select(Placement)
        .join(User, User.id == Placement.student_id)
        .join(class_students, class_students.c.student_id == Placement.student_id)
        .where(class_students.c.class_id == school_class.id, User.is_active)
        .options(
            selectinload(Placement.student),
            selectinload(Placement.workplace),
            selectinload(Placement.supervisor),
        )
        .order_by(User.name, Placement.start_date)
    )
    return [placement_read(p) for p in placements]


@me_router.get("", response_model=list[MyPlacement])
def my_placements(db: DbSession, user: Student) -> list[MyPlacement]:
    """Elevens egna placeringar, i datumordning."""
    placements = db.scalars(
        select(Placement)
        .where(Placement.student_id == user.id)
        .options(selectinload(Placement.workplace), selectinload(Placement.supervisor))
        .order_by(Placement.start_date)
    )
    return [
        MyPlacement(
            id=p.id,
            workplace=_workplace_ref(p.workplace),
            supervisor_name=p.supervisor.name,
            start_date=p.start_date,
            end_date=p.end_date,
        )
        for p in placements
    ]


@supervisor_router.get("/students", response_model=list[SupervisedStudent])
def supervised_students(db: DbSession, user: Supervisor) -> list[SupervisedStudent]:
    """Elever som handledaren har i dag, med period och arbetsplats."""
    today = time.today()
    placements = db.scalars(
        select(Placement)
        .join(User, User.id == Placement.student_id)
        .where(
            Placement.supervisor_id == user.id,
            Placement.start_date <= today,
            Placement.end_date >= today,
            User.is_active,
        )
        .options(selectinload(Placement.student), selectinload(Placement.workplace))
        .order_by(User.name)
    )
    return [
        SupervisedStudent(
            placement_id=p.id,
            student=Ref(id=p.student.id, name=p.student.name),
            workplace=_workplace_ref(p.workplace),
            start_date=p.start_date,
            end_date=p.end_date,
        )
        for p in placements
    ]
