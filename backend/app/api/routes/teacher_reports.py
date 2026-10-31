"""Sidan Redovisningar för läraren (Texas, 2026-10-31). Ersätter Elevhistorik.

- Alla inskickade redovisningar i lärarens klasser, senaste först, med filter för klass,
  elev och projekt och snabbval: olästa, sena, med kommentarer, med privat kommentar.
- Saknas: redovisningsdagar de senaste fyra veckorna där eleven inte har redovisat.
  Samma regler som Översikten.
- Per elev: senaste redovisning, olästa och saknade per elev.

Bara klasser läraren undervisar, på lärarens egen skola.
"""

from datetime import date, datetime
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import Select, exists, func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.api.routes.reports import PersonBrief, TextAnswer, _is_late, due_days, text_answers
from app.core import time
from app.core.time import SCHOOL_TZ
from app.db.session import DbSession
from app.models.report import (
    CommentVisibility,
    FormVersion,
    Report,
    ReportComment,
    ReportRead,
    ReportStatus,
)
from app.models.school_class import SchoolClass, class_teachers
from app.models.user import User, UserRole

router = APIRouter(prefix="/teacher/reports", tags=["reports"])

Teacher = Annotated[User, Depends(require_roles(UserRole.TEACHER))]

EXCERPT_LENGTH = 200


class Show(StrEnum):
    ALL = "all"
    UNREAD = "unread"
    LATE = "late"
    COMMENTS = "comments"
    PRIVATE = "private"


class TeacherReport(BaseModel):
    id: UUID
    student: PersonBrief
    school_class: PersonBrief
    project: PersonBrief | None
    due_date: date
    submitted_at: datetime
    is_late: bool
    is_read: bool
    comment_count: int
    has_private_comment: bool = Field(description="Minst en kommentar som bara personal ser")
    excerpt: TextAnswer | None = Field(description="Första textsvaret, förkortat")


class ReportCounts(BaseModel):
    """Antal per snabbval, med samma filter för klass, elev och projekt."""

    all: int
    unread: int
    late: int
    comments: int
    private: int
    missing: int = Field(description="Saknade redovisningar. 0 när projekt är valt")


class TeacherReports(BaseModel):
    reports: list[TeacherReport]
    counts: ReportCounts
    has_more: bool


class MissingReport(BaseModel):
    student: PersonBrief
    school_class: PersonBrief
    due_date: date


class StudentReportStats(BaseModel):
    student: PersonBrief
    school_class: PersonBrief
    last_submitted_at: datetime | None
    unread: int
    missing: int


def _taught_classes(db: Session, user: User, class_id: UUID | None) -> list[SchoolClass]:
    """Klasserna läraren undervisar på sin skola. 404 om en vald klass inte är en av dem."""
    query = (
        select(SchoolClass)
        .join(class_teachers, class_teachers.c.class_id == SchoolClass.id)
        .where(class_teachers.c.teacher_id == user.id, SchoolClass.school_id == user.school_id)
        .options(selectinload(SchoolClass.students))
        .order_by(SchoolClass.name)
    )
    if class_id is not None:
        query = query.where(SchoolClass.id == class_id)
    classes = list(db.scalars(query).unique())
    if class_id is not None and not classes:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")
    return classes


def _missing(
    db: Session, classes: list[SchoolClass], student_id: UUID | None
) -> list[MissingReport]:
    """Redovisningsdagar före i dag utan inskickad redovisning, senaste först."""
    today = time.today()
    published = set(
        db.scalars(
            select(FormVersion.class_id).where(FormVersion.class_id.in_([c.id for c in classes]))
        )
    )
    result: list[MissingReport] = []
    for school_class in classes:
        if school_class.id not in published:
            continue
        submitted = set(
            db.execute(
                select(Report.student_id, Report.due_date).where(
                    Report.class_id == school_class.id, Report.status == ReportStatus.SUBMITTED
                )
            )
        )
        for student in school_class.students:
            if not student.is_active or (student_id is not None and student.id != student_id):
                continue
            for day in due_days(db, student, school_class, today):
                if day < today and (student.id, day) not in submitted:
                    result.append(
                        MissingReport(
                            student=PersonBrief(id=student.id, name=student.name),
                            school_class=PersonBrief(id=school_class.id, name=school_class.name),
                            due_date=day,
                        )
                    )
    return sorted(result, key=lambda m: (-m.due_date.toordinal(), m.student.name))


def _is_read(user: User):
    return exists().where(ReportRead.report_id == Report.id, ReportRead.user_id == user.id)


def _has_comments():
    return exists().where(ReportComment.report_id == Report.id)


def _has_private():
    return exists().where(
        ReportComment.report_id == Report.id, ReportComment.visibility == CommentVisibility.STAFF
    )


def _late():
    local_day = func.date(func.timezone(SCHOOL_TZ.key, Report.submitted_at))
    return local_day > Report.due_date


def _filtered(
    classes: list[SchoolClass], student_id: UUID | None, project_id: UUID | None
) -> Select:
    query = select(Report).where(
        Report.class_id.in_([c.id for c in classes]), Report.status == ReportStatus.SUBMITTED
    )
    if student_id is not None:
        query = query.where(Report.student_id == student_id)
    if project_id is not None:
        query = query.where(Report.project_id == project_id)
    return query


def _count(db: Session, query: Select) -> int:
    return db.scalar(select(func.count()).select_from(query.subquery())) or 0


@router.get("", response_model=TeacherReports)
def list_teacher_reports(
    db: DbSession,
    user: Teacher,
    class_id: UUID | None = None,
    student_id: UUID | None = None,
    project_id: UUID | None = None,
    show: Show = Show.ALL,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> TeacherReports:
    """Inskickade redovisningar i lärarens klasser, senast inskickade först."""
    classes = _taught_classes(db, user, class_id)
    base = _filtered(classes, student_id, project_id)
    conditions = {
        Show.UNREAD: ~_is_read(user),
        Show.LATE: _late(),
        Show.COMMENTS: _has_comments(),
        Show.PRIVATE: _has_private(),
    }
    counts = ReportCounts(
        all=_count(db, base),
        unread=_count(db, base.where(conditions[Show.UNREAD])),
        late=_count(db, base.where(conditions[Show.LATE])),
        comments=_count(db, base.where(conditions[Show.COMMENTS])),
        private=_count(db, base.where(conditions[Show.PRIVATE])),
        missing=0 if project_id is not None else len(_missing(db, classes, student_id)),
    )

    query = base if show == Show.ALL else base.where(conditions[show])
    comment_count = (
        select(func.count()).where(ReportComment.report_id == Report.id).scalar_subquery()
    )
    rows = db.execute(
        query.add_columns(_is_read(user), comment_count, _has_private())
        .options(
            selectinload(Report.student),
            selectinload(Report.school_class),
            selectinload(Report.project),
            selectinload(Report.form_version),
            selectinload(Report.answers),
        )
        .order_by(Report.submitted_at.desc(), Report.id)
        .limit(limit + 1)
    ).all()

    reports = []
    for report, read, count, private in rows[:limit]:
        excerpt = text_answers(report, limit=1, length=EXCERPT_LENGTH)
        reports.append(
            TeacherReport(
                id=report.id,
                student=PersonBrief(id=report.student.id, name=report.student.name),
                school_class=PersonBrief(id=report.school_class.id, name=report.school_class.name),
                project=PersonBrief(id=report.project.id, name=report.project.name)
                if report.project
                else None,
                due_date=report.due_date,
                submitted_at=report.submitted_at,
                is_late=_is_late(report.due_date, report.submitted_at),
                is_read=read,
                comment_count=count,
                has_private_comment=private,
                excerpt=excerpt[0] if excerpt else None,
            )
        )
    return TeacherReports(reports=reports, counts=counts, has_more=len(rows) > limit)


@router.get("/missing", response_model=list[MissingReport])
def list_missing_reports(
    db: DbSession, user: Teacher, class_id: UUID | None = None, student_id: UUID | None = None
) -> list[MissingReport]:
    """Redovisningar som saknas de senaste fyra veckorna, senaste dagen först."""
    return _missing(db, _taught_classes(db, user, class_id), student_id)


@router.get("/students", response_model=list[StudentReportStats])
def list_student_report_stats(
    db: DbSession, user: Teacher, class_id: UUID | None = None
) -> list[StudentReportStats]:
    """Per elev i lärarens klasser: senaste redovisning, olästa och saknade."""
    classes = _taught_classes(db, user, class_id)
    missing: dict[tuple[UUID, UUID], int] = {}
    for item in _missing(db, classes, None):
        key = (item.school_class.id, item.student.id)
        missing[key] = missing.get(key, 0) + 1
    stats = {
        (class_id_, student_id): (last, unread)
        for class_id_, student_id, last, unread in db.execute(
            select(
                Report.class_id,
                Report.student_id,
                func.max(Report.submitted_at),
                func.count().filter(~_is_read(user)),
            )
            .where(
                Report.class_id.in_([c.id for c in classes]),
                Report.status == ReportStatus.SUBMITTED,
            )
            .group_by(Report.class_id, Report.student_id)
        )
    }
    result = []
    for school_class in classes:
        for student in sorted(school_class.students, key=lambda s: s.name):
            if not student.is_active:
                continue
            key = (school_class.id, student.id)
            last, unread = stats.get(key, (None, 0))
            result.append(
                StudentReportStats(
                    student=PersonBrief(id=student.id, name=student.name),
                    school_class=PersonBrief(id=school_class.id, name=school_class.name),
                    last_submitted_at=last,
                    unread=unread,
                    missing=missing.get(key, 0),
                )
            )
    return result
