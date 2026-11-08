"""Handledarens sida om en elev, i stil med lärarens elevsida (Texas, 2026-11-07).

Handledaren ser bara det som hör till praktiken hos sig: placeringen hos handledaren, närvaron
under den och redovisningarna för dagar då eleven var där. Andra praktikplatser och lärarens
egna uppföljningar syns inte.
"""

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import exists, select
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles
from app.api.routes.attendance import StudentAttendanceDetail, attendance_detail
from app.api.routes.placements import WorkplaceRef, _workplace_ref
from app.api.routes.reports import StudentReportSummary, due_days, supervised_reports
from app.api.routes.students import Ref
from app.core import time
from app.db.session import DbSession
from app.models.note import NoteTag, StudentNote
from app.models.placement import Placement
from app.models.report import FormVersion, Report, ReportStatus
from app.models.school_class import ClassTrack, SchoolClass, class_students
from app.models.user import User, UserRole
from app.services import messaging

router = APIRouter(prefix="/supervisor/students/{student_id}", tags=["supervisor"])

Supervisor = Annotated[User, Depends(require_roles(UserRole.SUPERVISOR))]


class SupervisorStudentDetail(BaseModel):
    placement_id: UUID
    student: Ref
    workplace: WorkplaceRef
    start_date: date
    end_date: date
    teachers: list[Ref]
    school_name: str | None
    class_name: str | None
    track_name: str | None = Field(description="Elevens inriktning i klassen, om den finns")


class SupervisorStudentReports(BaseModel):
    reports: list[StudentReportSummary]
    missing_days: list[date] = Field(
        description="Redovisningsdagar hos handledaren före i dag utan inskickad redovisning, "
        "senaste först"
    )


def _placement(db: DbSession, user: User, student_id: UUID) -> Placement:
    """Elevens placering hos handledaren: den pågående, annars den senaste. 404 annars."""
    today = time.today()
    placements = db.scalars(
        select(Placement)
        .join(User, User.id == Placement.student_id)
        .where(
            Placement.student_id == student_id,
            Placement.supervisor_id == user.id,
            User.is_active,
        )
        .options(selectinload(Placement.student), selectinload(Placement.workplace))
        .order_by(Placement.start_date.desc())
    ).all()
    current = next((p for p in placements if p.start_date <= today <= p.end_date), None)
    placement = current or next(iter(placements), None)
    if placement is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")
    return placement


def _school_class(db: DbSession, student_id: UUID) -> tuple[SchoolClass | None, str | None]:
    row = db.execute(
        select(SchoolClass, ClassTrack.name)
        .join(class_students, class_students.c.class_id == SchoolClass.id)
        .outerjoin(ClassTrack, ClassTrack.id == class_students.c.track_id)
        .where(class_students.c.student_id == student_id)
        .options(selectinload(SchoolClass.school))
    ).first()
    return (row[0], row[1]) if row else (None, None)


@router.get("", response_model=SupervisorStudentDetail)
def supervisor_student(
    student_id: UUID, db: DbSession, user: Supervisor
) -> SupervisorStudentDetail:
    """Eleven, placeringen hos handledaren, klassen och lärarna."""
    placement = _placement(db, user, student_id)
    student = placement.student
    school_class, track = _school_class(db, student.id)
    teacher_ids = messaging.teachers_of(db, [student.id])[student.id]
    teachers = db.scalars(
        select(User)
        .where(User.id.in_(teacher_ids), User.is_active, User.school_id == student.school_id)
        .order_by(User.name)
    ).all()
    return SupervisorStudentDetail(
        placement_id=placement.id,
        student=Ref(id=student.id, name=student.name),
        workplace=_workplace_ref(placement.workplace),
        start_date=placement.start_date,
        end_date=placement.end_date,
        teachers=[Ref(id=t.id, name=t.name) for t in teachers],
        school_name=school_class.school.name if school_class else None,
        class_name=school_class.name if school_class else None,
        track_name=track,
    )


@router.get("/attendance", response_model=StudentAttendanceDetail)
def supervisor_student_attendance(
    student_id: UUID, db: DbSession, user: Supervisor
) -> StudentAttendanceDetail:
    """Närvaron under placeringen hos handledaren."""
    placement = _placement(db, user, student_id)
    return attendance_detail(
        db,
        placement.student,
        [placement],
        placement.start_date,
        max(placement.start_date, min(placement.end_date, time.today())),
    )


@router.get("/reports", response_model=SupervisorStudentReports)
def supervisor_student_reports(
    student_id: UUID, db: DbSession, user: Supervisor
) -> SupervisorStudentReports:
    """Redovisningarna för dagar då eleven var hos handledaren, och de som saknas."""
    placement = _placement(db, user, student_id)
    reports = supervised_reports(db, user, student_id)
    school_class, _ = _school_class(db, student_id)
    today = time.today()
    missing: list[date] = []
    if school_class and db.scalar(select(exists().where(FormVersion.class_id == school_class.id))):
        submitted = set(
            db.scalars(
                select(Report.due_date).where(
                    Report.class_id == school_class.id,
                    Report.student_id == student_id,
                    Report.status == ReportStatus.SUBMITTED,
                )
            )
        )
        missing = sorted(
            (
                d
                for d in due_days(db, placement.student, school_class, today)
                if d < today
                and d not in submitted
                and placement.start_date <= d <= placement.end_date
            ),
            reverse=True,
        )
    return SupervisorStudentReports(reports=reports, missing_days=missing)


# --- Mina elever (Texas skiss "Handledarens elever", 2026-11-08) ---------------------------

list_router = APIRouter(prefix="/supervisor/student-list", tags=["supervisor"])


class LatestNote(BaseModel):
    tag: NoteTag
    created_at: datetime


class SupervisorStudentRow(BaseModel):
    student: Ref
    school_name: str | None
    class_name: str | None
    start_date: date
    end_date: date
    status: Literal["ongoing", "upcoming", "ended"]
    attendance_percent: int | None = Field(description="Närvaro under perioden hittills")
    report_count: int
    unread_count: int = Field(description="Redovisningar handledaren inte har läst")
    latest_note: LatestNote | None = Field(description="Handledarens senaste anteckning")


@list_router.get("", response_model=list[SupervisorStudentRow])
def supervisor_student_list(db: DbSession, user: Supervisor) -> list[SupervisorStudentRow]:
    """Alla elever som har, har haft eller ska ha praktik hos handledaren. En rad per elev med
    den pågående placeringen, annars den kommande, annars den senaste."""
    today = time.today()
    placements = db.scalars(
        select(Placement)
        .join(User, User.id == Placement.student_id)
        .where(Placement.supervisor_id == user.id, User.is_active)
        .options(selectinload(Placement.student))
        .order_by(User.name, Placement.start_date.desc())
    ).all()
    by_student: dict[UUID, list[Placement]] = {}
    for p in placements:
        by_student.setdefault(p.student_id, []).append(p)

    notes: dict[UUID, StudentNote] = {}
    for note in db.scalars(
        select(StudentNote)
        .where(StudentNote.author_id == user.id, StudentNote.student_id.in_(list(by_student)))
        .order_by(StudentNote.created_at)
    ):
        notes[note.student_id] = note

    rows: list[SupervisorStudentRow] = []
    for student_id, items in by_student.items():
        placement = (
            next((p for p in items if p.start_date <= today <= p.end_date), None)
            or next(
                (p for p in sorted(items, key=lambda p: p.start_date) if p.start_date > today), None
            )
            or items[0]
        )
        status_ = (
            "upcoming"
            if placement.start_date > today
            else "ended"
            if placement.end_date < today
            else "ongoing"
        )
        percent = None
        if status_ != "upcoming":
            summary = attendance_detail(
                db,
                placement.student,
                [placement],
                placement.start_date,
                min(placement.end_date, today),
            ).summary
            if summary.expected_days:
                percent = round(100 * summary.present / summary.expected_days)
        reports = supervised_reports(db, user, student_id)
        school_class, _ = _school_class(db, student_id)
        note = notes.get(student_id)
        rows.append(
            SupervisorStudentRow(
                student=Ref(id=placement.student.id, name=placement.student.name),
                school_name=school_class.school.name if school_class else None,
                class_name=school_class.name if school_class else None,
                start_date=placement.start_date,
                end_date=placement.end_date,
                status=status_,
                attendance_percent=percent,
                report_count=len(reports),
                unread_count=sum(1 for r in reports if not r.is_read),
                latest_note=LatestNote(tag=note.tag, created_at=note.created_at) if note else None,
            )
        )
    return rows
