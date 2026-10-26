"""Lärarens översikt (F6): dagens närvaro, elever som behöver uppmärksamhet och olästa
veckoredovisningar, för klasserna läraren undervisar.

Uppmärksamhet (Texas, 2026-10-26), viktigast först:
- Eleven har missat minst två incheckningar de senaste fyra veckorna. Samma gräns som
  "Följ upp" på sidan Närvaro.
- Eleven har inte lämnat en redovisning som skulle ha lämnats före i dag.
- Eleven har ingen praktikplats, fast andra i klassen har det.
"""

from datetime import date, datetime, timedelta
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import exists, func, select
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles
from app.api.routes.attendance import DEFAULT_PERIOD_DAYS, class_student_attendance
from app.api.routes.reports import PersonBrief, due_days, text_answers
from app.api.routes.students import CanViewStudent, get_student_for
from app.core import time
from app.db.session import DbSession
from app.models.attendance import Attendance, AttendanceStatus
from app.models.placement import Placement
from app.models.report import FormVersion, Report, ReportComment, ReportRead, ReportStatus
from app.models.school_class import SchoolClass, class_students, class_teachers
from app.models.user import User, UserRole

router = APIRouter(prefix="/teacher/overview", tags=["overview"])
student_router = APIRouter(prefix="/students/{student_id}/attention", tags=["overview"])

Teacher = Annotated[User, Depends(require_roles(UserRole.TEACHER))]

ATTENTION_MISSING_CHECK_INS = 2
REPORT_LIMIT = 10
PREVIEW_ANSWERS = 2
PREVIEW_LENGTH = 300


class AttentionReason(StrEnum):
    MISSING_CHECK_INS = "missing_check_ins"
    MISSING_REPORTS = "missing_reports"
    NO_PLACEMENT = "no_placement"


class ClassToday(BaseModel):
    id: UUID
    name: str
    on_apl: int = Field(description="Elever med en placering som pågår i dag")
    checked_in: int


class AttentionItem(BaseModel):
    student: PersonBrief
    class_name: str
    reason: AttentionReason
    count: int = Field(description="Antal missade incheckningar eller redovisningar. 0 annars")


class AnswerPreview(BaseModel):
    question: str
    text: str


class OverviewReport(BaseModel):
    id: UUID
    student: PersonBrief
    class_name: str
    due_date: date
    submitted_at: datetime
    is_late: bool
    comment_count: int
    preview: list[AnswerPreview] = Field(description="De första textsvaren, förkortade")


class TeacherOverview(BaseModel):
    today: date
    on_apl: int
    checked_in: int
    classes: list[ClassToday]
    attention: list[AttentionItem]
    unread_reports: int
    reports: list[OverviewReport] = Field(description="Olästa redovisningar, senaste först")


def _preview(report: Report) -> list[AnswerPreview]:
    return [
        AnswerPreview(question=a.question, text=a.text)
        for a in text_answers(report, limit=PREVIEW_ANSWERS, length=PREVIEW_LENGTH)
    ]


@router.get("", response_model=TeacherOverview)
def teacher_overview(db: DbSession, user: Teacher) -> TeacherOverview:
    """Översikten för lärarens klasser. Bara klasser på lärarens egen skola."""
    today = time.today()
    classes = (
        db.scalars(
            select(SchoolClass)
            .join(class_teachers, class_teachers.c.class_id == SchoolClass.id)
            .where(class_teachers.c.teacher_id == user.id, SchoolClass.school_id == user.school_id)
            .options(selectinload(SchoolClass.students))
            .order_by(SchoolClass.name)
        )
        .unique()
        .all()
    )
    class_ids = [c.id for c in classes]
    students = {s.id: s for c in classes for s in c.students if s.is_active}

    # Dagens närvaro: placeringar som pågår i dag, och dagens incheckningar.
    active = db.execute(
        select(Placement.student_id).where(
            Placement.student_id.in_(students),
            Placement.start_date <= today,
            Placement.end_date >= today,
        )
    ).scalars()
    on_apl = set(active) if today.weekday() < 5 else set()
    checked_in = set(
        db.scalars(
            select(Placement.student_id)
            .join(Attendance, Attendance.placement_id == Placement.id)
            .where(
                Placement.student_id.in_(on_apl),
                Attendance.date == today,
                Attendance.status == AttendanceStatus.PRESENT,
            )
        )
    )
    # Elever med en pågående eller kommande placering.
    placed = set(
        db.scalars(
            select(Placement.student_id).where(
                Placement.student_id.in_(students), Placement.end_date >= today
            )
        )
    )
    published = set(
        db.scalars(select(FormVersion.class_id).where(FormVersion.class_id.in_(class_ids)))
    )

    missing_check_ins: list[AttentionItem] = []
    missing_reports: list[AttentionItem] = []
    no_placement: list[AttentionItem] = []
    class_rows = []
    from_date = today - timedelta(days=DEFAULT_PERIOD_DAYS - 1)
    for school_class in classes:
        members = [s for s in school_class.students if s.is_active]
        class_rows.append(
            ClassToday(
                id=school_class.id,
                name=school_class.name,
                on_apl=sum(1 for s in members if s.id in on_apl),
                checked_in=sum(1 for s in members if s.id in checked_in),
            )
        )

        for row in class_student_attendance(db, school_class, from_date, today):
            if row.missing >= ATTENTION_MISSING_CHECK_INS:
                missing_check_ins.append(
                    AttentionItem(
                        student=PersonBrief(id=row.student.id, name=row.student.name),
                        class_name=school_class.name,
                        reason=AttentionReason.MISSING_CHECK_INS,
                        count=row.missing,
                    )
                )

        if school_class.id in published:
            submitted = {
                (student_id, day)
                for student_id, day in db.execute(
                    select(Report.student_id, Report.due_date).where(
                        Report.class_id == school_class.id,
                        Report.status == ReportStatus.SUBMITTED,
                    )
                )
            }
            for student in members:
                missed = sum(
                    1
                    for day in due_days(db, student, school_class, today)
                    if day < today and (student.id, day) not in submitted
                )
                if missed:
                    missing_reports.append(
                        AttentionItem(
                            student=PersonBrief(id=student.id, name=student.name),
                            class_name=school_class.name,
                            reason=AttentionReason.MISSING_REPORTS,
                            count=missed,
                        )
                    )

        if any(s.id in placed for s in members):
            no_placement.extend(
                AttentionItem(
                    student=PersonBrief(id=s.id, name=s.name),
                    class_name=school_class.name,
                    reason=AttentionReason.NO_PLACEMENT,
                    count=0,
                )
                for s in members
                if s.id not in placed
            )

    def most_first(items: list[AttentionItem]) -> list[AttentionItem]:
        return sorted(items, key=lambda i: (-i.count, i.student.name))

    attention = (
        most_first(missing_check_ins)
        + most_first(missing_reports)
        + sorted(no_placement, key=lambda i: i.student.name)
    )

    # Olästa inskickade redovisningar i lärarens klasser.
    unread = (
        select(Report)
        .where(
            Report.class_id.in_(class_ids),
            Report.status == ReportStatus.SUBMITTED,
            ~exists().where(ReportRead.report_id == Report.id, ReportRead.user_id == user.id),
        )
        .order_by(Report.submitted_at.desc())
    )
    unread_count = db.scalar(select(func.count()).select_from(unread.subquery())) or 0
    comment_counts = (
        select(func.count())
        .where(ReportComment.report_id == Report.id)
        .scalar_subquery()
        .label("comment_count")
    )
    reports = db.execute(
        unread.add_columns(comment_counts)
        .options(
            selectinload(Report.student),
            selectinload(Report.school_class),
            selectinload(Report.form_version),
            selectinload(Report.answers),
        )
        .limit(REPORT_LIMIT)
    ).all()

    return TeacherOverview(
        today=today,
        on_apl=len(on_apl),
        checked_in=len(checked_in),
        classes=class_rows,
        attention=attention,
        unread_reports=unread_count,
        reports=[
            OverviewReport(
                id=report.id,
                student=PersonBrief(id=report.student.id, name=report.student.name),
                class_name=report.school_class.name,
                due_date=report.due_date,
                submitted_at=report.submitted_at,
                is_late=time.local_date(report.submitted_at) > report.due_date,
                comment_count=count,
                preview=_preview(report),
            )
            for report, count in reports
        ],
    )


# --- Elevsidan ----------------------------------------------------------------------------


class StudentAttention(BaseModel):
    """Det som behöver följas upp för en elev, med samma regler som lärarens översikt."""

    items: list[AttentionItem]
    missing_report_days: list[date] = Field(
        description="Redovisningsdagar före i dag utan inskickad redovisning, senaste först"
    )


@student_router.get("", response_model=StudentAttention)
def student_attention(student_id: UUID, db: DbSession, user: CanViewStudent) -> StudentAttention:
    """Elevens uppmärksamhetspunkter i klassen eleven går i. Samma behörighet som elevsidan."""
    student = get_student_for(db, user, student_id)
    today = time.today()
    school_class = db.scalar(
        select(SchoolClass)
        .join(class_students, class_students.c.class_id == SchoolClass.id)
        .where(class_students.c.student_id == student.id)
        .options(selectinload(SchoolClass.students))
    )
    if school_class is None:
        return StudentAttention(items=[], missing_report_days=[])
    me = PersonBrief(id=student.id, name=student.name)
    items: list[AttentionItem] = []

    from_date = today - timedelta(days=DEFAULT_PERIOD_DAYS - 1)
    for row in class_student_attendance(db, school_class, from_date, today):
        if row.student.id == student.id and row.missing >= ATTENTION_MISSING_CHECK_INS:
            items.append(
                AttentionItem(
                    student=me,
                    class_name=school_class.name,
                    reason=AttentionReason.MISSING_CHECK_INS,
                    count=row.missing,
                )
            )

    missing_days: list[date] = []
    published = db.scalar(select(exists().where(FormVersion.class_id == school_class.id)))
    if published:
        submitted = set(
            db.scalars(
                select(Report.due_date).where(
                    Report.class_id == school_class.id,
                    Report.student_id == student.id,
                    Report.status == ReportStatus.SUBMITTED,
                )
            )
        )
        missing_days = sorted(
            (
                d
                for d in due_days(db, student, school_class, today)
                if d < today and d not in submitted
            ),
            reverse=True,
        )
        if missing_days:
            items.append(
                AttentionItem(
                    student=me,
                    class_name=school_class.name,
                    reason=AttentionReason.MISSING_REPORTS,
                    count=len(missing_days),
                )
            )

    members = [s.id for s in school_class.students if s.is_active]
    placed = set(
        db.scalars(
            select(Placement.student_id).where(
                Placement.student_id.in_(members), Placement.end_date >= today
            )
        )
    )
    if student.id not in placed and placed:
        items.append(
            AttentionItem(
                student=me,
                class_name=school_class.name,
                reason=AttentionReason.NO_PLACEMENT,
                count=0,
            )
        )
    return StudentAttention(items=items, missing_report_days=missing_days)
