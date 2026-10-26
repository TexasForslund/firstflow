"""Närvaro och incheckning (B4).

Eleven checkar in på sin pågående placering. Läraren ser närvaron per
elev i klassen, och handledaren ser dagens incheckningar för sina elever.

Regler (Texas, 2026-10-26):
- Bara vardagar. Ingen APL på helger.
- Incheckningen gäller i dag och tiden sätts av servern. Ingen plats (GPS) sparas.
- Eleven anmäler inte frånvaro i Firstflow (Texas, 2026-10-26). Frånvaro sköts som i dag,
  utanför Firstflow.
- "Ej incheckad" = förväntade APL-dagar minus incheckade dagar. Förväntade dagar räknas
  från klassens dagar per vecka, eftersom vi inte vet vilka veckodagar eleven har APL förrän
  det finns ett schema. Räknas bara när klassen kräver incheckning.

Behörighet: eleven sina egna dagar, läraren klassens elever (samma som klassvyn), handledaren
elever som hen handleder. Annat svarar 404.
"""

from datetime import date, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles
from app.api.routes.classes import CanViewClasses, get_accessible_class
from app.api.routes.students import CanViewStudent, get_student_for
from app.core import time
from app.db.session import DbSession
from app.models.attendance import Attendance, AttendanceStatus
from app.models.placement import Placement
from app.models.school_class import SchoolClass, class_students
from app.models.user import User, UserRole

router = APIRouter(prefix="/attendance", tags=["attendance"])
me_router = APIRouter(prefix="/me/attendance", tags=["attendance"])
class_router = APIRouter(prefix="/classes/{class_id}/attendance", tags=["attendance"])
supervisor_router = APIRouter(prefix="/supervisor/attendance", tags=["attendance"])
student_router = APIRouter(prefix="/students/{student_id}/attendance", tags=["attendance"])

Student = Annotated[User, Depends(require_roles(UserRole.STUDENT))]
Supervisor = Annotated[User, Depends(require_roles(UserRole.SUPERVISOR))]

DEFAULT_PERIOD_DAYS = 28
MAX_PERIOD_DAYS = 366


class Ref(BaseModel):
    id: UUID
    name: str


class AttendanceDay(BaseModel):
    date: date
    status: AttendanceStatus
    checked_in_at: datetime | None


class MyAttendance(BaseModel):
    """Elevens närvaro under den pågående placeringen."""

    placement_id: UUID | None = Field(description="Pågående placering. null = ingen APL i dag")
    workplace_name: str | None
    start_date: date | None
    end_date: date | None
    check_in_required: bool
    today: date
    can_check_in_today: bool = Field(description="Vardag med pågående placering")
    days: list[AttendanceDay] = Field(
        description="Registrerade dagar i placeringen, i datumordning"
    )


class StudentAttendance(BaseModel):
    student: Ref
    has_placement: bool = Field(description="Eleven har en placering under perioden")
    expected_days: int
    present: int
    missing: int = Field(description="Ej incheckad: förväntade dagar utan incheckning")
    today: AttendanceStatus | None = Field(description="Dagens status. null = inget registrerat")


class ClassAttendance(BaseModel):
    from_date: date
    to_date: date
    check_in_required: bool
    apl_days_per_week: int | None
    students: list[StudentAttendance]


class SupervisorAttendance(BaseModel):
    placement_id: UUID
    student: Ref
    workplace_name: str
    status: AttendanceStatus | None
    checked_in_at: datetime | None


def _day(row: Attendance) -> AttendanceDay:
    return AttendanceDay(date=row.date, status=row.status, checked_in_at=row.checked_in_at)


def _is_weekday(day: date) -> bool:
    return day.weekday() < 5


def _weekdays(start: date, end: date) -> int:
    """Antal vardagar från och med start till och med end."""
    if end < start:
        return 0
    days = (end - start).days + 1
    full_weeks, rest = divmod(days, 7)
    count = full_weeks * 5
    for i in range(rest):
        if (start + timedelta(days=full_weeks * 7 + i)).weekday() < 5:
            count += 1
    return count


def _placement_on(db: DbSession, student_id: UUID, day: date) -> Placement | None:
    """Elevens placering som pågår den dagen. Placeringar överlappar aldrig, så högst en."""
    return db.scalar(
        select(Placement).where(
            Placement.student_id == student_id,
            Placement.start_date <= day,
            Placement.end_date >= day,
        )
    )


def _check_in_required(db: DbSession, student_id: UUID) -> bool:
    """Om någon av elevens klasser kräver incheckning. Utan klass gäller standard (ja)."""
    values = db.scalars(
        select(SchoolClass.check_in_required)
        .join(class_students, class_students.c.class_id == SchoolClass.id)
        .where(class_students.c.student_id == student_id)
    ).all()
    return any(values) if values else True


def _existing(db: DbSession, placement_id: UUID, day: date) -> Attendance | None:
    return db.scalar(
        select(Attendance)
        .where(Attendance.placement_id == placement_id, Attendance.date == day)
        .with_for_update()
    )


# --- Eleven --------------------------------------------------------------------------------


@router.post("/check-in", response_model=AttendanceDay)
def check_in(db: DbSession, user: Student) -> AttendanceDay:
    """Checkar in i dag på elevens pågående placering. Ett andra anrop samma dag svarar med
    den befintliga incheckningen."""
    today = time.today()
    if not _is_weekday(today):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Det finns ingen APL på helger"
        )
    placement = _placement_on(db, user.id, today)
    if placement is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Du har ingen pågående APL i dag"
        )
    row = _existing(db, placement.id, today)
    if row is None:
        row = Attendance(placement_id=placement.id, date=today)
        db.add(row)
    elif row.status == AttendanceStatus.PRESENT:
        return _day(row)
    row.status = AttendanceStatus.PRESENT
    row.checked_in_at = time.now()
    row.note = None
    db.commit()
    return _day(row)


@me_router.get("", response_model=MyAttendance)
def my_attendance(db: DbSession, user: Student) -> MyAttendance:
    """Elevens dagar under den pågående placeringen."""
    today = time.today()
    placement = db.scalar(
        select(Placement)
        .where(
            Placement.student_id == user.id,
            Placement.start_date <= today,
            Placement.end_date >= today,
        )
        .options(selectinload(Placement.workplace))
    )
    required = _check_in_required(db, user.id)
    if placement is None:
        return MyAttendance(
            placement_id=None,
            workplace_name=None,
            start_date=None,
            end_date=None,
            check_in_required=required,
            today=today,
            can_check_in_today=False,
            days=[],
        )
    rows = db.scalars(
        select(Attendance).where(Attendance.placement_id == placement.id).order_by(Attendance.date)
    )
    return MyAttendance(
        placement_id=placement.id,
        workplace_name=placement.workplace.name,
        start_date=placement.start_date,
        end_date=placement.end_date,
        check_in_required=required,
        today=today,
        can_check_in_today=_is_weekday(today),
        days=[_day(r) for r in rows],
    )


# --- Läraren -------------------------------------------------------------------------------


def _expected_days(
    placements: list[Placement], start: date, end: date, per_week: int | None
) -> int:
    """Förväntade APL-dagar för placeringarna inom perioden, fram till och med i dag."""
    weekdays = 0
    for p in placements:
        weekdays += _weekdays(max(p.start_date, start), min(p.end_date, end))
    if per_week is None or per_week >= 5:
        return weekdays
    return round(weekdays * per_week / 5)


@class_router.get("", response_model=ClassAttendance)
def class_attendance(
    class_id: UUID,
    db: DbSession,
    user: CanViewClasses,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
) -> ClassAttendance:
    """Närvaron per elev i klassen under perioden. Standard är de senaste fyra veckorna."""
    school_class = get_accessible_class(db, user, class_id)
    today = time.today()
    to_date = to_date or today
    from_date = from_date or to_date - timedelta(days=DEFAULT_PERIOD_DAYS - 1)
    if from_date > to_date:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Periodens start är efter slutet"
        )
    if (to_date - from_date).days >= MAX_PERIOD_DAYS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Perioden får vara högst ett år"
        )
    # Framtida dagar räknas inte som förväntade.
    counted_to = min(to_date, today)

    students = [s for s in school_class.students if s.is_active]
    ids = [s.id for s in students]
    placements = db.scalars(
        select(Placement).where(
            Placement.student_id.in_(ids),
            Placement.start_date <= to_date,
            Placement.end_date >= from_date,
        )
    ).all()
    rows = db.execute(
        select(Placement.student_id, Attendance.date, Attendance.status)
        .join(Placement, Placement.id == Attendance.placement_id)
        .where(
            Placement.student_id.in_(ids),
            Attendance.date >= from_date,
            Attendance.date <= max(counted_to, from_date),
        )
    ).all()
    today_rows = db.execute(
        select(Placement.student_id, Attendance.status)
        .join(Placement, Placement.id == Attendance.placement_id)
        .where(Placement.student_id.in_(ids), Attendance.date == today)
    ).all()
    today_status = {student_id: s for student_id, s in today_rows}

    result = []
    for student in students:
        own = [p for p in placements if p.student_id == student.id]
        counts = {s: 0 for s in AttendanceStatus}
        for student_id, day, s in rows:
            if student_id == student.id and day <= counted_to:
                counts[AttendanceStatus(s)] += 1
        expected = _expected_days(own, from_date, counted_to, school_class.apl_days_per_week)
        present = counts[AttendanceStatus.PRESENT]
        missing = max(0, expected - present) if school_class.check_in_required else 0
        result.append(
            StudentAttendance(
                student=Ref(id=student.id, name=student.name),
                has_placement=bool(own),
                expected_days=expected,
                present=counts[AttendanceStatus.PRESENT],
                missing=missing,
                today=today_status.get(student.id),
            )
        )
    return ClassAttendance(
        from_date=from_date,
        to_date=to_date,
        check_in_required=school_class.check_in_required,
        apl_days_per_week=school_class.apl_days_per_week,
        students=result,
    )


# --- Handledaren ---------------------------------------------------------------------------


@supervisor_router.get("", response_model=list[SupervisorAttendance])
def supervisor_attendance(
    db: DbSession, user: Supervisor, day: Annotated[date | None, Query(alias="date")] = None
) -> list[SupervisorAttendance]:
    """Dagens incheckningar och anmälningar för elever som handledaren har den dagen."""
    day = day or time.today()
    placements = db.scalars(
        select(Placement)
        .join(User, User.id == Placement.student_id)
        .where(
            Placement.supervisor_id == user.id,
            Placement.start_date <= day,
            Placement.end_date >= day,
            User.is_active,
        )
        .options(selectinload(Placement.student), selectinload(Placement.workplace))
        .order_by(User.name)
    ).all()
    rows = {
        r.placement_id: r
        for r in db.scalars(
            select(Attendance).where(
                Attendance.placement_id.in_([p.id for p in placements]), Attendance.date == day
            )
        )
    }
    result = []
    for p in placements:
        row = rows.get(p.id)
        result.append(
            SupervisorAttendance(
                placement_id=p.id,
                student=Ref(id=p.student.id, name=p.student.name),
                workplace_name=p.workplace.name,
                status=row.status if row else None,
                checked_in_at=row.checked_in_at if row else None,
            )
        )
    return result


# --- Elevsidan ----------------------------------------------------------------------------


class StudentAttendanceDetail(BaseModel):
    """Närvaron för en elev, för elevsidan."""

    from_date: date
    to_date: date
    check_in_required: bool
    summary: StudentAttendance
    days: list[AttendanceDay] = Field(description="Registrerade dagar i perioden, senaste först")


@student_router.get("", response_model=StudentAttendanceDetail)
def student_attendance(
    student_id: UUID,
    db: DbSession,
    user: CanViewStudent,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
) -> StudentAttendanceDetail:
    """Elevens närvaro. Utan period gäller den pågående eller senaste placeringen."""
    student = get_student_for(db, user, student_id)
    today = time.today()
    placements = db.scalars(
        select(Placement).where(Placement.student_id == student.id).order_by(Placement.start_date)
    ).all()
    if from_date is None or to_date is None:
        started = [p for p in placements if p.start_date <= today]
        if started:
            current = started[-1]
            from_date = from_date or current.start_date
            to_date = to_date or min(current.end_date, today)
        else:
            to_date = to_date or today
            from_date = from_date or to_date - timedelta(days=DEFAULT_PERIOD_DAYS - 1)
    if from_date > to_date:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Periodens start är efter slutet"
        )
    school_class = db.scalar(
        select(SchoolClass)
        .join(class_students, class_students.c.class_id == SchoolClass.id)
        .where(class_students.c.student_id == student.id)
    )
    required = school_class.check_in_required if school_class else True
    per_week = school_class.apl_days_per_week if school_class else None
    counted_to = min(to_date, today)
    in_period = [p for p in placements if p.start_date <= to_date and p.end_date >= from_date]
    rows = db.scalars(
        select(Attendance)
        .where(
            Attendance.placement_id.in_([p.id for p in placements]),
            Attendance.date >= from_date,
            Attendance.date <= to_date,
        )
        .order_by(Attendance.date.desc())
    ).all()
    counts = {s: 0 for s in AttendanceStatus}
    for row in rows:
        if row.date <= counted_to:
            counts[AttendanceStatus(row.status)] += 1
    expected = _expected_days(in_period, from_date, counted_to, per_week)
    today_row = next((r for r in rows if r.date == today), None)
    return StudentAttendanceDetail(
        from_date=from_date,
        to_date=to_date,
        check_in_required=required,
        summary=StudentAttendance(
            student=Ref(id=student.id, name=student.name),
            has_placement=bool(in_period),
            expected_days=expected,
            present=counts[AttendanceStatus.PRESENT],
            missing=max(0, expected - counts[AttendanceStatus.PRESENT]) if required else 0,
            today=today_row.status if today_row else None,
        ),
        days=[_day(r) for r in rows],
    )
