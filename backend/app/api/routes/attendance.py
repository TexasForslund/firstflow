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

Bekräftad närvaro (Texas, 2026-10-29):
- Handledaren bekräftar incheckningarna, lägger till dagar eleven glömde och kan säga att
  eleven inte var på plats. Det går upp till två veckor bakåt (REVIEW_DAYS).
- En dag har ett läge (DayState): bekräftad, väntar på handledaren, inte på plats eller ej
  incheckad.
- En incheckning som väntar räknas som närvaro. En dag där handledaren säger "inte på plats"
  räknas inte, även om eleven checkade in.
- Dagar godkänns aldrig automatiskt.

Behörighet: eleven sina egna dagar, läraren klassens elever (samma som klassvyn), handledaren
elever som hen handleder. Annat svarar 404.
"""

from datetime import date, datetime, timedelta
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles
from app.api.routes.classes import CanViewClasses, get_accessible_class
from app.api.routes.invitations import notify
from app.api.routes.students import CanViewStudent, get_student_for
from app.core import time
from app.db.session import DbSession
from app.models.attendance import Attendance, AttendanceReview, AttendanceStatus
from app.models.placement import Placement
from app.models.school_class import SchoolClass, class_students
from app.models.user import User, UserRole
from app.services.apl_days import (
    DEFAULT_APL_WEEKDAYS,
    class_apl_weekdays,
    count_apl_days,
    student_apl_weekdays,
)

router = APIRouter(prefix="/attendance", tags=["attendance"])
me_router = APIRouter(prefix="/me/attendance", tags=["attendance"])
class_router = APIRouter(prefix="/classes/{class_id}/attendance", tags=["attendance"])
supervisor_router = APIRouter(prefix="/supervisor/attendance", tags=["attendance"])
student_router = APIRouter(prefix="/students/{student_id}/attendance", tags=["attendance"])

Student = Annotated[User, Depends(require_roles(UserRole.STUDENT))]
Supervisor = Annotated[User, Depends(require_roles(UserRole.SUPERVISOR))]
Teacher = Annotated[User, Depends(require_roles(UserRole.TEACHER))]

DEFAULT_PERIOD_DAYS = 28
MAX_PERIOD_DAYS = 366
# Hur många dagar bakåt handledaren kan bekräfta och rätta närvaron, i dag inräknad.
REVIEW_DAYS = 14


class Ref(BaseModel):
    id: UUID
    name: str


class DayState(StrEnum):
    CONFIRMED = "confirmed"  # bekräftad av handledaren
    PENDING = "pending"  # incheckad, väntar på handledaren
    NOT_PRESENT = "not_present"  # inte på plats enligt handledaren
    MISSING = "missing"  # ej incheckad


def day_state(row: Attendance | None) -> DayState:
    if row is None:
        return DayState.MISSING
    if row.review == AttendanceReview.NOT_PRESENT:
        return DayState.NOT_PRESENT
    if row.status != AttendanceStatus.PRESENT:
        return DayState.MISSING
    if row.review == AttendanceReview.CONFIRMED:
        return DayState.CONFIRMED
    return DayState.PENDING


def counts_as_present(status: str, review: str | None) -> bool:
    """Närvarande: incheckad eller tillagd av handledaren, och inte "inte på plats"."""
    return status == AttendanceStatus.PRESENT and review != AttendanceReview.NOT_PRESENT


class AttendanceDay(BaseModel):
    date: date
    status: AttendanceStatus
    checked_in_at: datetime | None
    state: DayState


class MyAttendance(BaseModel):
    """Elevens närvaro under den pågående placeringen."""

    placement_id: UUID | None = Field(description="Pågående placering. null = ingen APL i dag")
    workplace_name: str | None
    start_date: date | None
    end_date: date | None
    check_in_required: bool
    today: date
    can_check_in_today: bool = Field(description="APL-dag med pågående placering")
    apl_weekdays: list[int] = Field(description="Elevens APL-dagar, 0 = måndag … 6 = söndag")
    days: list[AttendanceDay] = Field(
        description="Registrerade dagar i placeringen, i datumordning"
    )


class StudentAttendance(BaseModel):
    student: Ref
    has_placement: bool = Field(description="Eleven har en placering under perioden")
    expected_days: int
    present: int
    missing: int = Field(description="Ej incheckad: förväntade dagar utan incheckning")
    pending: int = Field(default=0, description="Incheckade dagar som väntar på handledaren")
    not_present: int = Field(
        default=0, description="Incheckade dagar där handledaren säger att eleven inte var där"
    )
    today: AttendanceStatus | None = Field(description="Dagens status. null = inget registrerat")
    today_state: DayState = DayState.MISSING
    today_checked_in_at: datetime | None = None


class ClassAttendance(BaseModel):
    from_date: date
    to_date: date
    check_in_required: bool
    apl_weekdays: list[int] = Field(description="Klassens APL-dagar, 0 = måndag … 6 = söndag")
    students: list[StudentAttendance]


class SupervisorAttendance(BaseModel):
    placement_id: UUID
    student: Ref
    workplace_name: str
    status: AttendanceStatus | None
    checked_in_at: datetime | None
    state: DayState = DayState.MISSING


def _day(row: Attendance) -> AttendanceDay:
    return AttendanceDay(
        date=row.date, status=row.status, checked_in_at=row.checked_in_at, state=day_state(row)
    )


def _is_apl_day(db: DbSession, student_id: UUID, day: date) -> bool:
    return day.weekday() in student_apl_weekdays(db, [student_id])[student_id]


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
    if not _is_apl_day(db, user.id, today):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="I dag är ingen APL-dag för din klass"
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
    apl_weekdays = sorted(student_apl_weekdays(db, [user.id])[user.id])
    if placement is None:
        return MyAttendance(
            apl_weekdays=apl_weekdays,
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
        apl_weekdays=apl_weekdays,
        placement_id=placement.id,
        workplace_name=placement.workplace.name,
        start_date=placement.start_date,
        end_date=placement.end_date,
        check_in_required=required,
        today=today,
        can_check_in_today=_is_apl_day(db, user.id, today),
        days=[_day(r) for r in rows],
    )


# --- Läraren -------------------------------------------------------------------------------


def _expected_days(
    placements: list[Placement], start: date, end: date, weekdays: frozenset[int]
) -> int:
    """Förväntade APL-dagar för placeringarna inom perioden, fram till och med i dag."""
    return sum(
        count_apl_days(max(p.start_date, start), min(p.end_date, end), weekdays) for p in placements
    )


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
    return ClassAttendance(
        from_date=from_date,
        to_date=to_date,
        check_in_required=school_class.check_in_required,
        apl_weekdays=sorted(school_class.apl_weekdays),
        students=class_student_attendance(db, school_class, from_date, to_date),
    )


def class_student_attendance(
    db: DbSession, school_class: SchoolClass, from_date: date, to_date: date
) -> list[StudentAttendance]:
    """Närvaron per aktiv elev i klassen under perioden. Används också av lärarens översikt."""
    today = time.today()
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
        select(Placement.student_id, Attendance)
        .join(Placement, Placement.id == Attendance.placement_id)
        .where(
            Placement.student_id.in_(ids),
            Attendance.date >= min(from_date, today),
            Attendance.date <= max(counted_to, from_date, today),
        )
    ).all()
    today_rows = {student_id: row for student_id, row in rows if row.date == today}

    result = []
    for student in students:
        own = [p for p in placements if p.student_id == student.id]
        mine = [
            r
            for student_id, r in rows
            if student_id == student.id and from_date <= r.date <= counted_to
        ]
        expected = _expected_days(own, from_date, counted_to, class_apl_weekdays(school_class))
        present = sum(1 for r in mine if counts_as_present(r.status, r.review))
        missing = max(0, expected - present) if school_class.check_in_required else 0
        today_row = today_rows.get(student.id)
        result.append(
            StudentAttendance(
                student=Ref(id=student.id, name=student.name),
                has_placement=bool(own),
                expected_days=expected,
                present=present,
                missing=missing,
                pending=sum(1 for r in mine if day_state(r) == DayState.PENDING),
                not_present=sum(
                    1 for r in mine if day_state(r) == DayState.NOT_PRESENT and r.checked_in_at
                ),
                today=today_row.status if today_row else None,
                today_state=day_state(today_row),
                today_checked_in_at=today_row.checked_in_at if today_row else None,
            )
        )
    return result


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
                state=day_state(row),
            )
        )
    return result


class ReviewItem(BaseModel):
    placement_id: UUID
    student: Ref
    workplace_name: str
    date: date
    state: DayState
    checked_in_at: datetime | None


class ReviewList(BaseModel):
    today: date
    earliest: date = Field(description="Tidigaste dagen som går att bekräfta")
    today_items: list[ReviewItem] = Field(description="Alla elever som har APL i dag")
    earlier: list[ReviewItem] = Field(
        description="Tidigare dagar som väntar: incheckningar som inte är bekräftade, och dagar "
        "i veckan utan incheckning. Senaste först"
    )


class ReviewVerdict(BaseModel):
    placement_id: UUID
    date: date
    verdict: AttendanceReview


class ReviewBody(BaseModel):
    items: list[ReviewVerdict] = Field(min_length=1, max_length=100)


def _review_list(db: DbSession, user: User) -> ReviewList:
    today = time.today()
    earliest = today - timedelta(days=REVIEW_DAYS - 1)
    monday = today - timedelta(days=today.weekday())
    placements = db.scalars(
        select(Placement)
        .join(User, User.id == Placement.student_id)
        .where(
            Placement.supervisor_id == user.id,
            Placement.start_date <= today,
            Placement.end_date >= earliest,
            User.is_active,
        )
        .options(selectinload(Placement.student), selectinload(Placement.workplace))
        .order_by(User.name)
    ).all()
    rows = {
        (r.placement_id, r.date): r
        for r in db.scalars(
            select(Attendance).where(
                Attendance.placement_id.in_([p.id for p in placements]),
                Attendance.date >= earliest,
                Attendance.date <= today,
            )
        )
    }
    today_items: list[ReviewItem] = []
    earlier: list[ReviewItem] = []
    apl_days = student_apl_weekdays(db, {p.student_id for p in placements})
    for p in placements:
        first = max(p.start_date, earliest)
        for offset in range((min(p.end_date, today) - first).days + 1):
            day = first + timedelta(days=offset)
            if day.weekday() not in apl_days[p.student_id]:
                continue
            row = rows.get((p.id, day))
            state = day_state(row)
            item = ReviewItem(
                placement_id=p.id,
                student=Ref(id=p.student.id, name=p.student.name),
                workplace_name=p.workplace.name,
                date=day,
                state=state,
                checked_in_at=row.checked_in_at if row else None,
            )
            if day == today:
                today_items.append(item)
            elif state == DayState.PENDING or (state == DayState.MISSING and day >= monday):
                earlier.append(item)
    earlier.sort(key=lambda i: (i.date, i.student.name), reverse=True)
    return ReviewList(today=today, earliest=earliest, today_items=today_items, earlier=earlier)


@supervisor_router.get("/review", response_model=ReviewList)
def review_list(db: DbSession, user: Supervisor) -> ReviewList:
    """Dagar som handledaren kan bekräfta: i dag och de som väntar från tidigare."""
    return _review_list(db, user)


@supervisor_router.post("/review", response_model=ReviewList)
def review(body: ReviewBody, db: DbSession, user: Supervisor) -> ReviewList:
    """Bekräftar dagar, lägger till dagar eleven glömde eller säger att eleven inte var på
    plats. Bara för elever handledaren har, klassens APL-dagar och upp till två veckor bakåt."""
    today = time.today()
    earliest = today - timedelta(days=REVIEW_DAYS - 1)
    now = time.now()
    for verdict in body.items:
        placement = db.get(Placement, verdict.placement_id)
        if placement is None or placement.supervisor_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")
        day = verdict.date
        if (
            not _is_apl_day(db, placement.student_id, day)
            or not earliest <= day <= today
            or not placement.start_date <= day <= placement.end_date
        ):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Dagen går inte att bekräfta. Det går två veckor bakåt, på APL-dagar.",
            )
        row = _existing(db, placement.id, day)
        if row is None:
            row = Attendance(placement_id=placement.id, date=day, status=AttendanceStatus.ABSENT)
            db.add(row)
        if verdict.verdict == AttendanceReview.CONFIRMED:
            # Utan incheckning lade handledaren till dagen.
            row.status = AttendanceStatus.PRESENT
        elif row.checked_in_at is None:
            row.status = AttendanceStatus.ABSENT
        row.review = verdict.verdict
        row.reviewed_at = now
        row.reviewed_by_id = user.id
        db.flush()
    db.commit()
    return _review_list(db, user)


# --- Lärarens veckovy ----------------------------------------------------------------------


class WeekDay(BaseModel):
    date: date
    on_apl: bool = Field(description="Eleven har en placering den dagen")
    state: DayState
    checked_in_at: datetime | None


class WeekStudent(BaseModel):
    student: Ref
    supervisor: Ref | None
    days: list[WeekDay]


class WaitingSupervisor(BaseModel):
    supervisor: Ref
    count: int = Field(description="Incheckningar som väntar på handledaren den här veckan")


class ClassWeek(BaseModel):
    week_start: date
    days: list[date]
    today: date
    check_in_required: bool
    students: list[WeekStudent]
    waiting: list[WaitingSupervisor]


class Reminded(BaseModel):
    reminded: int = Field(description="Antal handledare som fick en påminnelse")


@class_router.get("/week", response_model=ClassWeek)
def class_week(
    class_id: UUID,
    db: DbSession,
    user: CanViewClasses,
    start: Annotated[date | None, Query(description="En dag i veckan. Standard är i dag")] = None,
) -> ClassWeek:
    """Klassens närvaro veckans APL-dagar, med läget för varje dag. Har klassen inga APL-dagar
    visas måndag till fredag."""
    school_class = get_accessible_class(db, user, class_id)
    today = time.today()
    anchor = start or today
    monday = anchor - timedelta(days=anchor.weekday())
    weekdays = sorted(school_class.apl_weekdays) or sorted(DEFAULT_APL_WEEKDAYS)
    days = [monday + timedelta(days=i) for i in weekdays]
    students = sorted((s for s in school_class.students if s.is_active), key=lambda s: s.name)
    placements = db.scalars(
        select(Placement)
        .where(
            Placement.student_id.in_([s.id for s in students]),
            Placement.start_date <= days[-1],
            Placement.end_date >= days[0],
        )
        .options(selectinload(Placement.supervisor))
    ).all()
    rows = {
        (r.placement_id, r.date): r
        for r in db.scalars(
            select(Attendance).where(
                Attendance.placement_id.in_([p.id for p in placements]),
                Attendance.date >= days[0],
                Attendance.date <= days[-1],
            )
        )
    }
    waiting: dict[UUID, WaitingSupervisor] = {}
    result = []
    for student in students:
        own = [p for p in placements if p.student_id == student.id]
        week_days = []
        for day in days:
            placement = next((p for p in own if p.start_date <= day <= p.end_date), None)
            row = rows.get((placement.id, day)) if placement else None
            state = day_state(row)
            if state == DayState.PENDING and placement:
                entry = waiting.setdefault(
                    placement.supervisor_id,
                    WaitingSupervisor(
                        supervisor=Ref(id=placement.supervisor.id, name=placement.supervisor.name),
                        count=0,
                    ),
                )
                entry.count += 1
            week_days.append(
                WeekDay(
                    date=day,
                    on_apl=placement is not None,
                    state=state,
                    checked_in_at=row.checked_in_at if row else None,
                )
            )
        current = next((p for p in own if p.start_date <= today <= p.end_date), None) or (
            own[-1] if own else None
        )
        result.append(
            WeekStudent(
                student=Ref(id=student.id, name=student.name),
                supervisor=(
                    Ref(id=current.supervisor.id, name=current.supervisor.name) if current else None
                ),
                days=week_days,
            )
        )
    return ClassWeek(
        week_start=monday,
        days=days,
        today=today,
        check_in_required=school_class.check_in_required,
        students=result,
        waiting=sorted(waiting.values(), key=lambda w: w.supervisor.name),
    )


@class_router.post("/remind", response_model=Reminded)
def remind_supervisors(class_id: UUID, db: DbSession, user: Teacher) -> Reminded:
    """Påminner handledare som har incheckningar att bekräfta för klassens elever, de senaste
    två veckorna."""
    school_class = get_accessible_class(db, user, class_id)
    today = time.today()
    pending = db.execute(
        select(Placement.supervisor_id, Attendance.id)
        .join(Attendance, Attendance.placement_id == Placement.id)
        .where(
            Placement.student_id.in_([s.id for s in school_class.students if s.is_active]),
            Attendance.date >= today - timedelta(days=REVIEW_DAYS - 1),
            Attendance.date <= today,
            Attendance.status == AttendanceStatus.PRESENT,
            Attendance.review.is_(None),
        )
    ).all()
    per_supervisor: dict[UUID, int] = {}
    for supervisor_id, _ in pending:
        per_supervisor[supervisor_id] = per_supervisor.get(supervisor_id, 0) + 1
    for supervisor_id, count in per_supervisor.items():
        days = "dag" if count == 1 else "dagar"
        notify(
            db,
            supervisor_id,
            f"{user.name} påminner dig om att bekräfta närvaron, {count} {days} väntar",
            "/attendance-review",
        )
    db.commit()
    return Reminded(reminded=len(per_supervisor))


# --- Elevsidan ----------------------------------------------------------------------------


class StudentAttendanceDetail(BaseModel):
    """Närvaron för en elev, för elevsidan."""

    from_date: date
    to_date: date
    check_in_required: bool
    apl_weekdays: list[int] = Field(description="Elevens APL-dagar, 0 = måndag … 6 = söndag")
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
    weekdays = class_apl_weekdays(school_class)
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
    counted = [r for r in rows if r.date <= counted_to]
    present = sum(1 for r in counted if counts_as_present(r.status, r.review))
    expected = _expected_days(in_period, from_date, counted_to, weekdays)
    today_row = next((r for r in rows if r.date == today), None)
    return StudentAttendanceDetail(
        from_date=from_date,
        to_date=to_date,
        check_in_required=required,
        apl_weekdays=sorted(weekdays),
        summary=StudentAttendance(
            student=Ref(id=student.id, name=student.name),
            has_placement=bool(in_period),
            expected_days=expected,
            present=present,
            missing=max(0, expected - present) if required else 0,
            pending=sum(1 for r in counted if day_state(r) == DayState.PENDING),
            not_present=sum(
                1 for r in counted if day_state(r) == DayState.NOT_PRESENT and r.checked_in_at
            ),
            today=today_row.status if today_row else None,
            today_state=day_state(today_row),
            today_checked_in_at=today_row.checked_in_at if today_row else None,
        ),
        days=[_day(r) for r in rows],
    )
