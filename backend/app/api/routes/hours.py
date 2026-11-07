"""Arbetstider för företag och egna tider per praktikplats (idé 12, Texas 2026-11-07).

- Handledaren lägger in företagets arbetstider. De gäller alla elever hos företaget.
- En elev kan få egna tider. Då gäller bara de.
- Eleven kan checka in från tio minuter innan dagen börjar (se `attendance.check_in`).
- Läraren och eleven ser tiderna men ändrar dem inte.
"""

from datetime import time as clock_time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, require_roles
from app.api.routes.placements import supervisor_workplace_id
from app.api.routes.students import Ref, get_student_for
from app.core import time
from app.db.session import DbSession
from app.models.hours import PlacementHours, WorkplaceHours
from app.models.placement import Placement, Workplace
from app.models.user import User, UserRole
from app.services.hours import hours_for_placement

router = APIRouter(tags=["hours"])

Supervisor = Annotated[User, Depends(require_roles(UserRole.SUPERVISOR))]


class Day(BaseModel):
    weekday: int = Field(ge=0, le=6, description="0 = måndag … 6 = söndag")
    start: clock_time
    end: clock_time

    @field_validator("end")
    @classmethod
    def after_start(cls, end: clock_time, info) -> clock_time:  # noqa: ANN001
        start = info.data.get("start")
        if start is not None and end <= start:
            raise ValueError("Dagen måste sluta efter att den börjar")
        return end


class Week(BaseModel):
    days: list[Day] = Field(max_length=7)

    @field_validator("days")
    @classmethod
    def one_per_day(cls, days: list[Day]) -> list[Day]:
        if len({d.weekday for d in days}) != len(days):
            raise ValueError("Varje dag får bara finnas en gång")
        return sorted(days, key=lambda d: d.weekday)


class StudentHours(BaseModel):
    placement_id: UUID
    student: Ref
    own_days: list[Day] | None = Field(
        description="Egna tider, eller null om eleven följer företagets"
    )


class CompanyHours(BaseModel):
    days: list[Day]
    students: list[StudentHours] = Field(description="Handledarens elever hos företaget")


class PlacementHoursRead(BaseModel):
    days: list[Day] = Field(description="Tiderna som gäller för eleven")
    own: bool = Field(description="Eleven har egna tider")
    company_days: list[Day]


class OwnHours(BaseModel):
    days: list[Day] | None = Field(
        default=None, max_length=7, description="Egna tider. null eller tom: följ företagets"
    )


def _days(rows: list[WorkplaceHours] | list[PlacementHours]) -> list[Day]:
    return [
        Day(weekday=r.weekday, start=r.start_time, end=r.end_time)
        for r in sorted(rows, key=lambda r: r.weekday)
    ]


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


def _own_workplace(db: DbSession, user: User, workplace_id: UUID) -> Workplace:
    workplace = db.get(Workplace, workplace_id)
    if workplace is None or supervisor_workplace_id(db, user.id) != workplace_id:
        raise _not_found()
    return workplace


def _company_hours(db: DbSession, user: User, workplace_id: UUID) -> CompanyHours:
    rows = list(
        db.scalars(select(WorkplaceHours).where(WorkplaceHours.workplace_id == workplace_id))
    )
    today = time.today()
    placements = db.scalars(
        select(Placement)
        .join(User, User.id == Placement.student_id)
        .where(
            Placement.workplace_id == workplace_id,
            Placement.supervisor_id == user.id,
            Placement.end_date >= today,
            User.is_active,
        )
        .options(selectinload(Placement.student))
        .order_by(User.name)
    ).all()
    own: dict[UUID, list[PlacementHours]] = {}
    for row in db.scalars(
        select(PlacementHours).where(PlacementHours.placement_id.in_([p.id for p in placements]))
    ):
        own.setdefault(row.placement_id, []).append(row)
    return CompanyHours(
        days=_days(rows),
        students=[
            StudentHours(
                placement_id=p.id,
                student=Ref(id=p.student.id, name=p.student.name),
                own_days=_days(own[p.id]) if p.id in own else None,
            )
            for p in placements
        ],
    )


@router.get("/supervisor/workplaces/{workplace_id}/hours", response_model=CompanyHours)
def get_company_hours(workplace_id: UUID, db: DbSession, user: Supervisor) -> CompanyHours:
    """Företagets arbetstider och vilka elever som följer dem."""
    _own_workplace(db, user, workplace_id)
    return _company_hours(db, user, workplace_id)


@router.put("/supervisor/workplaces/{workplace_id}/hours", response_model=CompanyHours)
def set_company_hours(
    workplace_id: UUID, body: Week, db: DbSession, user: Supervisor
) -> CompanyHours:
    """Sparar företagets arbetstider. En tom lista tar bort dem."""
    _own_workplace(db, user, workplace_id)
    db.execute(delete(WorkplaceHours).where(WorkplaceHours.workplace_id == workplace_id))
    db.add_all(
        WorkplaceHours(
            workplace_id=workplace_id, weekday=d.weekday, start_time=d.start, end_time=d.end
        )
        for d in body.days
    )
    db.commit()
    return _company_hours(db, user, workplace_id)


def _placement_for(db: DbSession, user: User, placement_id: UUID) -> Placement:
    """Praktikplatsen om användaren får se den: handledaren, eleven själv eller personal som
    får se eleven."""
    placement = db.get(Placement, placement_id)
    if placement is None:
        raise _not_found()
    if user.role == UserRole.SUPERVISOR:
        if placement.supervisor_id != user.id:
            raise _not_found()
    elif user.role == UserRole.STUDENT:
        if placement.student_id != user.id:
            raise _not_found()
    elif user.role in (UserRole.TEACHER, UserRole.SYV, UserRole.PRINCIPAL, UserRole.SCHOOL_ADMIN):
        get_student_for(db, user, placement.student_id)
    else:
        raise _not_found()
    return placement


def _placement_hours(db: DbSession, placement: Placement) -> PlacementHoursRead:
    rows, own = hours_for_placement(db, placement)
    company = db.scalars(
        select(WorkplaceHours).where(WorkplaceHours.workplace_id == placement.workplace_id)
    ).all()
    return PlacementHoursRead(days=_days(rows), own=own, company_days=_days(list(company)))


@router.get("/placements/{placement_id}/hours", response_model=PlacementHoursRead)
def get_placement_hours(placement_id: UUID, db: DbSession, user: CurrentUser) -> PlacementHoursRead:
    """Tiderna som gäller för eleven på praktikplatsen."""
    return _placement_hours(db, _placement_for(db, user, placement_id))


@router.put("/supervisor/placements/{placement_id}/hours", response_model=PlacementHoursRead)
def set_own_hours(
    placement_id: UUID, body: OwnHours, db: DbSession, user: Supervisor
) -> PlacementHoursRead:
    """Egna tider för eleven. Utan dagar följer eleven företagets tider igen."""
    placement = db.get(Placement, placement_id)
    if placement is None or placement.supervisor_id != user.id:
        raise _not_found()
    days = Week(days=body.days or []).days
    db.execute(delete(PlacementHours).where(PlacementHours.placement_id == placement_id))
    db.add_all(
        PlacementHours(
            placement_id=placement_id, weekday=d.weekday, start_time=d.start, end_time=d.end
        )
        for d in days
    )
    db.commit()
    return _placement_hours(db, placement)
