"""Veckoredovisningar (B5): eleven svarar steg för steg, läraren läser och kommenterar.

Flöde för eleven:
1. GET /api/reports/mine visar redovisningsdagarna de senaste fyra veckorna.
2. POST /api/reports startar (eller öppnar) redovisningen för en klass och en dag.
3. PUT /api/reports/{id}/answers/{question_id} sparar svaret när eleven trycker Nästa.
   Svaret visar vilka frågor eleven får härnäst (`path`), med hänsyn till logiken.
4. POST /api/reports/{id}/submit skickar in. Därefter går redovisningen inte att ändra,
   men eleven och läraren kan kommentera den.

Behörighet:
- Eleven ser bara sina egna redovisningar och bara i klasser hen går i.
- Läraren ser inskickade redovisningar i klasser hen undervisar i. Utkast är privata.
- Skoladmin, rektor och superadmin ser inte redovisningarna. De behövs inte i deras arbete.
- Handledaren får åtkomst när kopplingen elev–handledare finns (B3).
Allt som användaren inte har tillgång till svarar 404.
"""

from datetime import date, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import exists, func, select, true
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles, require_same_school
from app.api.routes.classes import get_accessible_class
from app.api.routes.forms import latest_version
from app.api.routes.students import get_student_for
from app.core import time
from app.db.session import DbSession
from app.models.report import (
    FormVersion,
    Report,
    ReportAnswer,
    ReportComment,
    ReportRead,
    ReportStatus,
)
from app.models.school_class import SchoolClass, class_students, class_teachers
from app.models.user import User, UserRole
from app.services.report_forms import (
    AnswerError,
    AnswerValue,
    Question,
    QuestionType,
    is_required,
    normalize_answer,
    parse_questions,
    visible_path,
)

router = APIRouter(prefix="/reports", tags=["reports"])
student_router = APIRouter(prefix="/students/{student_id}/reports", tags=["reports"])
class_router = APIRouter(prefix="/classes/{class_id}/reports", tags=["reports"])

# Hur långt bakåt eleven kan lämna en redovisning som inte är gjord.
REPORT_WINDOW_DAYS = 28
STUDENT_PAGE_ANSWER_LENGTH = 1000

Student = Annotated[User, Depends(require_roles(UserRole.STUDENT))]
Teacher = Annotated[User, Depends(require_roles(UserRole.TEACHER))]
StudentOrTeacher = Annotated[User, Depends(require_roles(UserRole.STUDENT, UserRole.TEACHER))]


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


# --- Svarsmodeller ------------------------------------------------------------------------


class PersonBrief(BaseModel):
    id: UUID
    name: str


class AnswerRead(AnswerValue):
    question_id: UUID


class CommentRead(BaseModel):
    id: UUID
    author: PersonBrief
    author_role: UserRole
    body: str
    created_at: datetime


class ReportDetail(BaseModel):
    id: UUID
    class_id: UUID
    class_name: str
    project: PersonBrief | None = Field(description="Projektet redovisningen gäller (B12)")
    student: PersonBrief
    due_date: date
    status: ReportStatus
    started_at: datetime
    submitted_at: datetime | None
    is_late: bool
    form_version: int
    questions: list[Question]
    answers: list[AnswerRead]
    path: list[UUID] = Field(
        description="Frågorna eleven får, i ordning, med hänsyn till logiken och svaren"
    )
    comments: list[CommentRead]
    is_read: bool | None = Field(description="Om du (läraren) har läst den. null för eleven")


class DueReport(BaseModel):
    class_id: UUID
    class_name: str
    due_date: date
    report_id: UUID | None
    status: Literal["not_started", "draft", "submitted"]
    is_late: bool


class ReportSummary(BaseModel):
    id: UUID
    student: PersonBrief
    due_date: date
    submitted_at: datetime
    is_late: bool
    is_read: bool
    comment_count: int


class ReportStart(BaseModel):
    class_id: UUID
    due_date: date


class CommentCreate(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


# --- Hjälpfunktioner ----------------------------------------------------------------------


def _is_late(due_date: date, submitted_at: datetime | None) -> bool:
    done = time.local_date(submitted_at) if submitted_at else time.today()
    return done > due_date


def _teaches(db: DbSession, user: User, class_id: UUID) -> bool:
    return bool(
        db.scalar(
            select(
                exists().where(
                    class_teachers.c.class_id == class_id, class_teachers.c.teacher_id == user.id
                )
            )
        )
    )


def _teaches_student_now(db: DbSession, user: User, student_id: UUID) -> bool:
    """Läraren undervisar klassen som eleven går i nu.

    Då ser läraren alla elevens redovisningar, även från en tidigare klass. Redovisningarna
    följer eleven när hen byter klass (Texas, 2026-10-26).
    """
    return bool(
        db.scalar(
            select(
                exists().where(
                    class_students.c.student_id == student_id,
                    class_teachers.c.class_id == class_students.c.class_id,
                    class_teachers.c.teacher_id == user.id,
                )
            )
        )
    )


def _in_class(db: DbSession, student: User, class_id: UUID) -> bool:
    return bool(
        db.scalar(
            select(
                exists().where(
                    class_students.c.class_id == class_id,
                    class_students.c.student_id == student.id,
                )
            )
        )
    )


def _first_due_date(db: DbSession, student: User, class_id: UUID, today: date) -> date:
    """Första dagen eleven ska redovisa i klassen.

    Det senaste av: fyra veckor bakåt, dagen då klassen först fick frågor och dagen då eleven
    lades i klassen. Dagar före det räknas inte som missade.
    """
    first = today - timedelta(days=REPORT_WINDOW_DAYS - 1)
    first_published = db.scalar(
        select(func.min(FormVersion.published_at)).where(FormVersion.class_id == class_id)
    )
    enrolled = db.scalar(
        select(class_students.c.created_at).where(
            class_students.c.class_id == class_id, class_students.c.student_id == student.id
        )
    )
    for moment in (first_published, enrolled):
        if moment is not None:
            first = max(first, time.local_date(moment))
    return first


def due_days(db: DbSession, student: User, school_class: SchoolClass, today: date) -> list[date]:
    """Redovisningsdagarna de senaste fyra veckorna för eleven i klassen, enligt klassens
    APL-villkor. Klassen måste ha ett publicerat formulär, det kontrollerar den som anropar."""
    weekdays = set(school_class.report_due_weekdays)
    first = _first_due_date(db, student, school_class.id, today)
    return [
        day
        for offset in range(REPORT_WINDOW_DAYS)
        if (day := today - timedelta(days=offset)) >= first and day.weekday() in weekdays
    ]


def _get_report(db: DbSession, user: User, report_id: UUID, *, for_update: bool = False) -> Report:
    """Redovisningen om användaren får se den, annars 404."""
    query = (
        select(Report)
        .where(Report.id == report_id)
        .options(
            selectinload(Report.school_class),
            selectinload(Report.student),
            selectinload(Report.form_version),
            selectinload(Report.answers),
            selectinload(Report.project),
            selectinload(Report.comments).selectinload(ReportComment.author),
        )
    )
    if for_update:
        query = query.with_for_update()
    report = db.scalar(query)
    if report is None:
        raise _not_found()
    require_same_school(user, report.school_class.school_id)
    # Eleven måste fortfarande gå i klassen. Tas hen bort ur klassen försvinner åtkomsten.
    if (
        user.role == UserRole.STUDENT
        and report.student_id == user.id
        and _in_class(db, user, report.class_id)
    ):
        return report
    if (
        user.role == UserRole.TEACHER
        and report.status == ReportStatus.SUBMITTED
        and (
            _teaches(db, user, report.class_id) or _teaches_student_now(db, user, report.student_id)
        )
    ):
        return report
    raise _not_found()


def _detail(db: DbSession, user: User, report: Report) -> ReportDetail:
    questions = parse_questions(report.form_version.questions)
    answers = {a.question_id: AnswerValue.model_validate(a) for a in report.answers}
    is_read = None
    if user.role == UserRole.TEACHER:
        is_read = db.get(ReportRead, (report.id, user.id)) is not None
    return ReportDetail(
        id=report.id,
        class_id=report.class_id,
        class_name=report.school_class.name,
        project=PersonBrief(id=report.project.id, name=report.project.name)
        if report.project
        else None,
        student=PersonBrief(id=report.student.id, name=report.student.name),
        due_date=report.due_date,
        status=report.status,
        started_at=report.started_at,
        submitted_at=report.submitted_at,
        is_late=_is_late(report.due_date, report.submitted_at),
        form_version=report.form_version.version,
        questions=questions,
        answers=[
            AnswerRead(question_id=qid, **answer.model_dump()) for qid, answer in answers.items()
        ],
        path=visible_path(questions, answers),
        comments=[
            CommentRead(
                id=c.id,
                author=PersonBrief(id=c.author.id, name=c.author.name),
                author_role=c.author.role,
                body=c.body,
                created_at=c.created_at,
            )
            for c in report.comments
        ],
        is_read=is_read,
    )


def _require_draft(report: Report) -> None:
    if report.status != ReportStatus.DRAFT:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Redovisningen är inskickad och kan inte ändras"
        )


# --- Eleven -------------------------------------------------------------------------------


@router.get("/mine", response_model=list[DueReport])
def my_reports(db: DbSession, user: Student) -> list[DueReport]:
    """Redovisningsdagarna de senaste fyra veckorna i elevens klasser, nyast först.

    Bara klasser med ett publicerat formulär räknas. Dagarna kommer från klassens
    APL-villkor (`report_due_weekdays`) och börjar tidigast när klassen fick frågor och
    eleven kom in i klassen.
    """
    today = time.today()
    start = today - timedelta(days=REPORT_WINDOW_DAYS - 1)
    classes = db.scalars(
        select(SchoolClass)
        .join(class_students, class_students.c.class_id == SchoolClass.id)
        .where(class_students.c.student_id == user.id, SchoolClass.school_id == user.school_id)
    ).all()
    by_id = {c.id: c for c in classes}
    published = set(
        db.scalars(select(FormVersion.class_id).where(FormVersion.class_id.in_(by_id)).distinct())
    )
    reports = {
        (r.class_id, r.due_date): r
        for r in db.scalars(
            select(Report).where(
                Report.student_id == user.id,
                Report.class_id.in_(by_id),
                Report.due_date >= start,
            )
        )
    }

    slots = set(reports)
    for class_id in published:
        slots.update((class_id, day) for day in due_days(db, user, by_id[class_id], today))

    items = []
    for class_id, day in slots:
        report = reports.get((class_id, day))
        items.append(
            DueReport(
                class_id=class_id,
                class_name=by_id[class_id].name,
                due_date=day,
                report_id=report.id if report else None,
                status=report.status if report else "not_started",
                is_late=_is_late(day, report.submitted_at if report else None),
            )
        )
    return sorted(items, key=lambda i: (-i.due_date.toordinal(), i.class_name))


@router.post("", response_model=ReportDetail)
def start_report(body: ReportStart, db: DbSession, user: Student) -> ReportDetail:
    """Startar redovisningen för en klass och en dag, eller öppnar den om den redan finns.

    Dagen måste vara en av klassens redovisningsdagar, inte i framtiden, högst fyra veckor
    bakåt och inte före dagen då klassen fick frågor eller eleven kom in i klassen.
    """
    school_class = db.get(SchoolClass, body.class_id)
    if school_class is None or school_class.school_id != user.school_id:
        raise _not_found()
    if not _in_class(db, user, school_class.id):
        raise _not_found()

    existing = db.scalar(
        select(Report).where(
            Report.student_id == user.id,
            Report.class_id == school_class.id,
            Report.due_date == body.due_date,
        )
    )
    if existing is not None:
        return _detail(db, user, existing)

    today = time.today()
    if body.due_date > today:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Dagen har inte kommit än"
        )
    if body.due_date.weekday() not in school_class.report_due_weekdays:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Klassen har ingen redovisning den dagen",
        )
    version = latest_version(db, school_class.id)
    if version is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Läraren har inte publicerat några frågor än"
        )
    if body.due_date < _first_due_date(db, user, school_class.id, today):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Den dagen behöver du inte lämna någon redovisning",
        )

    # Två samtidiga anrop (t.ex. dubbelklick) ska ge samma redovisning, inte ett fel.
    db.execute(
        insert(Report)
        .values(
            class_id=school_class.id,
            student_id=user.id,
            form_version_id=version.id,
            due_date=body.due_date,
            status=ReportStatus.DRAFT,
        )
        .on_conflict_do_nothing()
    )
    db.commit()
    report = db.scalar(
        select(Report).where(
            Report.student_id == user.id,
            Report.class_id == school_class.id,
            Report.due_date == body.due_date,
        )
    )
    assert report is not None
    return _detail(db, user, report)


@router.get("/{report_id}", response_model=ReportDetail)
def get_report(report_id: UUID, db: DbSession, user: StudentOrTeacher) -> ReportDetail:
    return _detail(db, user, _get_report(db, user, report_id))


@router.put("/{report_id}/answers/{question_id}", response_model=ReportDetail)
def save_answer(
    report_id: UUID, question_id: UUID, body: AnswerValue, db: DbSession, user: Student
) -> ReportDetail:
    """Sparar svaret på en fråga när eleven trycker Nästa. Ett tomt svar tar bort svaret."""
    # Låst, så att ett svar inte kan sparas samtidigt som redovisningen skickas in.
    report = _get_report(db, user, report_id, for_update=True)
    _require_draft(report)
    question = next(
        (q for q in parse_questions(report.form_version.questions) if q.id == question_id), None
    )
    if question is None:
        raise _not_found()
    try:
        answer = normalize_answer(question, body)
    except AnswerError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from None

    if answer is None:
        existing = db.get(ReportAnswer, (report.id, question_id))
        if existing is not None:
            db.delete(existing)
    else:
        values = answer.model_dump()
        db.execute(
            insert(ReportAnswer)
            .values(report_id=report.id, question_id=question_id, **values)
            .on_conflict_do_update(
                index_elements=[ReportAnswer.report_id, ReportAnswer.question_id],
                set_={**values, "answered_at": func.now()},
            )
        )
    db.commit()
    db.expire_all()
    return _detail(db, user, report)


@router.post("/{report_id}/submit", response_model=ReportDetail)
def submit_report(report_id: UUID, db: DbSession, user: Student) -> ReportDetail:
    """Skickar in redovisningen. Alla obligatoriska frågor som eleven får måste vara besvarade.

    Svar på frågor som logiken hoppade över tas bort, så att bara det eleven faktiskt
    lämnade in sparas.
    """
    report = _get_report(db, user, report_id, for_update=True)
    _require_draft(report)
    questions = parse_questions(report.form_version.questions)
    answers = {a.question_id: a for a in report.answers}
    path = visible_path(
        questions, {qid: AnswerValue.model_validate(a) for qid, a in answers.items()}
    )
    by_id = {q.id: q for q in questions}
    for question_id in path:
        question = by_id[question_id]
        if is_required(question) and question_id not in answers:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f'Svara på frågan "{question.title}" innan du skickar in',
            )
    on_path = set(path)
    for question_id, answer in answers.items():
        if question_id not in on_path:
            db.delete(answer)
    report.status = ReportStatus.SUBMITTED
    report.submitted_at = time.now()
    db.commit()
    db.expire_all()
    return _detail(db, user, report)


# --- Läraren och kommentarer --------------------------------------------------------------


@router.post("/{report_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(report_id: UUID, db: DbSession, user: Teacher) -> Response:
    """Markerar redovisningen som läst av läraren."""
    report = _get_report(db, user, report_id)
    db.execute(
        insert(ReportRead).values(report_id=report.id, user_id=user.id).on_conflict_do_nothing()
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{report_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED
)
def add_comment(
    report_id: UUID, body: CommentCreate, db: DbSession, user: StudentOrTeacher
) -> CommentRead:
    """Kommentar på en inskickad redovisning, från eleven själv eller en lärare för klassen."""
    report = _get_report(db, user, report_id)
    if report.status != ReportStatus.SUBMITTED:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Det går att kommentera när redovisningen är inskickad"
        )
    comment = ReportComment(report_id=report.id, author_id=user.id, body=body.body)
    db.add(comment)
    db.commit()
    return CommentRead(
        id=comment.id,
        author=PersonBrief(id=user.id, name=user.name),
        author_role=user.role,
        body=comment.body,
        created_at=comment.created_at,
    )


@class_router.get("", response_model=list[ReportSummary])
def list_class_reports(
    class_id: UUID,
    db: DbSession,
    user: Teacher,
    student_id: UUID | None = None,
    unread_only: bool = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[ReportSummary]:
    """Klassens inskickade redovisningar, senast inskickade först. Bara för klassens lärare."""
    get_accessible_class(db, user, class_id)
    is_read = (
        exists()
        .where(ReportRead.report_id == Report.id, ReportRead.user_id == user.id)
        .label("is_read")
    )
    comment_count = (
        select(func.count())
        .where(ReportComment.report_id == Report.id)
        .scalar_subquery()
        .label("comment_count")
    )
    query = (
        select(Report, is_read, comment_count)
        .options(selectinload(Report.student))
        .where(Report.class_id == class_id, Report.status == ReportStatus.SUBMITTED)
        .order_by(Report.submitted_at.desc())
        .limit(limit)
    )
    if student_id is not None:
        query = query.where(Report.student_id == student_id)
    if unread_only:
        query = query.where(~is_read)
    return [
        ReportSummary(
            id=report.id,
            student=PersonBrief(id=report.student.id, name=report.student.name),
            due_date=report.due_date,
            submitted_at=report.submitted_at,
            is_late=_is_late(report.due_date, report.submitted_at),
            is_read=read,
            comment_count=count,
        )
        for report, read, count in db.execute(query).all()
    ]


class TextAnswer(BaseModel):
    question_id: UUID
    question: str
    text: str


def text_answers(report: Report, *, limit: int | None = None, length: int) -> list[TextAnswer]:
    """Redovisningens textsvar i frågornas ordning, förkortade till `length` tecken.
    `report.form_version` och `report.answers` måste vara laddade."""
    answers = {a.question_id: a for a in report.answers}
    result: list[TextAnswer] = []
    for question in parse_questions(report.form_version.questions):
        if question.type not in (QuestionType.SHORT_TEXT, QuestionType.LONG_TEXT):
            continue
        answer = answers.get(question.id)
        text = (answer.text or "").strip() if answer else ""
        if not text:
            continue
        if len(text) > length:
            text = text[:length].rstrip() + "…"
        result.append(TextAnswer(question_id=question.id, question=question.title, text=text))
        if limit is not None and len(result) == limit:
            break
    return result


class StudentReportSummary(ReportSummary):
    class_name: str
    project: PersonBrief | None
    answers: list[TextAnswer] = Field(description="Alla textsvar, för sök och filter på elevsidan")


@student_router.get("", response_model=list[StudentReportSummary])
def list_student_reports(
    student_id: UUID, db: DbSession, user: Teacher
) -> list[StudentReportSummary]:
    """Elevens inskickade redovisningar, senaste först. Går eleven i en klass som läraren
    undervisar syns alla, även från tidigare klasser. Annars bara från lärarens klasser."""
    student = get_student_for(db, user, student_id)
    taught = select(class_teachers.c.class_id).where(class_teachers.c.teacher_id == user.id)
    in_class = true() if _teaches_student_now(db, user, student.id) else Report.class_id.in_(taught)
    is_read = (
        exists()
        .where(ReportRead.report_id == Report.id, ReportRead.user_id == user.id)
        .label("is_read")
    )
    comment_count = (
        select(func.count())
        .where(ReportComment.report_id == Report.id)
        .scalar_subquery()
        .label("comment_count")
    )
    query = (
        select(Report, is_read, comment_count)
        .options(
            selectinload(Report.student),
            selectinload(Report.school_class),
            selectinload(Report.form_version),
            selectinload(Report.answers),
            selectinload(Report.project),
        )
        .where(
            Report.student_id == student.id,
            Report.status == ReportStatus.SUBMITTED,
            in_class,
        )
        .order_by(Report.submitted_at.desc())
    )
    return [
        StudentReportSummary(
            id=report.id,
            student=PersonBrief(id=report.student.id, name=report.student.name),
            due_date=report.due_date,
            submitted_at=report.submitted_at,
            is_late=_is_late(report.due_date, report.submitted_at),
            is_read=read,
            comment_count=count,
            class_name=report.school_class.name,
            answers=text_answers(report, length=STUDENT_PAGE_ANSWER_LENGTH),
            project=PersonBrief(id=report.project.id, name=report.project.name)
            if report.project
            else None,
        )
        for report, read, count in db.execute(query).all()
    ]
