"""Projekt (B12): läraren skapar projekt och kopplar elever. Redovisningar kan höra till ett
projekt.

Beslut (Texas, 2026-10-26): ett projekt har namn, beskrivning, valfri deadline och taggar i
fritext. Ett projekt kan ha flera elever. Läraren som skapade projektet ändrar och tar bort det.

Beslut (Texas, 2026-10-29): projektet kan göras på ett företag, och läraren kan bjuda in
företagets handledare. Handledarna ändrar namn, beskrivning, slutdatum och taggar, men inte
vilka elever som är med. De ser projektets redovisningar.

Behörighet: läraren ser och ändrar sina egna projekt. Eleverna måste vara elever läraren får se
(samma regel som elevsidan). Handledare måste höra till projektets företag, och företaget måste
vara ett läraren får se. En handledare ser bara projekt hen är inbjuden till. Handledare har
ingen skola, så för dem är inbjudan kopplingen. Elevens projekt syns på elevsidan med elevsidans
behörighet.
"""

from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, StringConstraints, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles, require_same_school
from app.api.routes.invitations import notify
from app.api.routes.placements import _get_workplace
from app.api.routes.reports import TextAnswer, _is_late, text_answers
from app.api.routes.students import CanViewStudent, get_student_for
from app.core import time
from app.db.session import DbSession
from app.models.project import Project, project_students, project_supervisors
from app.models.report import CommentVisibility, Report, ReportComment, ReportRead, ReportStatus
from app.models.user import User, UserRole

router = APIRouter(prefix="/projects", tags=["projects"])
student_router = APIRouter(prefix="/students/{student_id}/projects", tags=["projects"])
me_router = APIRouter(prefix="/me/projects", tags=["projects"])

Teacher = Annotated[User, Depends(require_roles(UserRole.TEACHER))]
Member = Annotated[User, Depends(require_roles(UserRole.TEACHER, UserRole.SUPERVISOR))]

# Svaren i projektets redovisningar visas i sin helhet, som på elevsidan.
PROJECT_ANSWER_LENGTH = 1000

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class Ref(BaseModel):
    id: UUID
    name: str


class ProjectRead(BaseModel):
    id: UUID
    name: str
    description: str | None
    deadline: date | None
    tags: list[str]
    students: list[Ref]
    owner: Ref = Field(description="Läraren som skapade projektet")
    workplace: Ref | None = Field(description="Företaget projektet görs på")
    supervisors: list[Ref] = Field(description="Inbjudna handledare")
    completed_at: datetime | None = Field(description="Satt när projektet är avslutat")
    created_at: datetime
    report_count: int = Field(description="Inskickade redovisningar kopplade till projektet")
    unread_count: int = Field(description="Olästa redovisningar för läraren. 0 för handledare")
    is_owner: bool
    can_edit_students: bool = Field(
        description="Om du får ändra elever, företag, handledare och avsluta projektet"
    )


class ProjectWrite(BaseModel):
    """Fält som är null lämnas som de är. Handledare får bara skicka namn, beskrivning,
    slutdatum och taggar."""

    name: Name
    description: str | None = Field(default=None, max_length=2000)
    deadline: date | None = None
    tags: list[Tag] = Field(default_factory=list, max_length=10)
    student_ids: list[UUID] | None = Field(default=None, max_length=100)
    workplace_id: UUID | None = None
    clear_workplace: bool = Field(default=False, description="Tar bort företaget från projektet")
    supervisor_ids: list[UUID] | None = Field(default=None, max_length=20)
    completed: bool | None = None

    @field_validator("description")
    @classmethod
    def strip_description(cls, value: str | None) -> str | None:
        return (value or "").strip() or None

    @field_validator("tags")
    @classmethod
    def unique_tags(cls, value: list[str]) -> list[str]:
        seen: list[str] = []
        for tag in value:
            if tag.lower() not in (t.lower() for t in seen):
                seen.append(tag)
        return seen


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


def _ref(user: User) -> Ref:
    return Ref(id=user.id, name=user.name)


def _read(db: DbSession, user: User, projects: list[Project]) -> list[ProjectRead]:
    ids = [p.id for p in projects]
    submitted = (Report.project_id.in_(ids), Report.status == ReportStatus.SUBMITTED)
    counts = dict(
        db.execute(
            select(Report.project_id, func.count(Report.id))
            .where(*submitted)
            .group_by(Report.project_id)
        ).all()
    )
    unread: dict[UUID, int] = {}
    if user.role == UserRole.TEACHER:
        read = select(ReportRead.report_id).where(ReportRead.user_id == user.id)
        unread = dict(
            db.execute(
                select(Report.project_id, func.count(Report.id))
                .where(*submitted, Report.id.not_in(read))
                .group_by(Report.project_id)
            ).all()
        )
    return [
        ProjectRead(
            id=p.id,
            name=p.name,
            description=p.description,
            deadline=p.deadline,
            tags=list(p.tags),
            students=[_ref(s) for s in p.students if s.is_active],
            owner=_ref(p.owner),
            workplace=Ref(id=p.workplace.id, name=p.workplace.name) if p.workplace else None,
            supervisors=[_ref(s) for s in p.supervisors if s.is_active],
            completed_at=p.completed_at,
            created_at=p.created_at,
            report_count=counts.get(p.id, 0),
            unread_count=unread.get(p.id, 0),
            is_owner=p.owner_id == user.id,
            can_edit_students=p.owner_id == user.id,
        )
        for p in projects
    ]


_LOAD = (
    selectinload(Project.students),
    selectinload(Project.supervisors),
    selectinload(Project.owner),
    selectinload(Project.workplace),
)


def _is_supervisor_of(db: DbSession, user: User, project_id: UUID) -> bool:
    return (
        db.scalar(
            select(project_supervisors.c.project_id).where(
                project_supervisors.c.project_id == project_id,
                project_supervisors.c.supervisor_id == user.id,
            )
        )
        is not None
    )


def _project_for(db: DbSession, user: User, project_id: UUID) -> Project:
    """Projektet om användaren är läraren som äger det eller en inbjuden handledare, annars 404."""
    project = db.scalar(select(Project).where(Project.id == project_id).options(*_LOAD))
    if project is None:
        raise _not_found()
    if user.role == UserRole.TEACHER and project.owner_id == user.id:
        require_same_school(user, project.school_id)
        return project
    if user.role == UserRole.SUPERVISOR and _is_supervisor_of(db, user, project.id):
        return project
    raise _not_found()


def _own_project(db: DbSession, user: User, project_id: UUID) -> Project:
    project = _project_for(db, user, project_id)
    if project.owner_id != user.id:
        raise _not_found()
    return project


def _students(db: DbSession, user: User, ids: list[UUID]) -> list[User]:
    """Eleverna om läraren får se alla, annars 404 (samma regel som elevsidan)."""
    return [get_student_for(db, user, student_id) for student_id in dict.fromkeys(ids)]


def _set_workplace_and_supervisors(
    db: DbSession, user: User, project: Project, body: ProjectWrite
) -> list[User]:
    """Sätter företag och handledare. Returnerar handledare som är nya i projektet."""
    if body.clear_workplace:
        project.workplace = None
    elif body.workplace_id is not None:
        project.workplace = _get_workplace(db, user, body.workplace_id)
    allowed = {s.id: s for s in project.workplace.supervisors} if project.workplace else {}
    before = {s.id for s in project.supervisors}
    if body.supervisor_ids is None:
        # Byts företaget följer bara handledare som hör till det nya företaget med.
        project.supervisors = [s for s in project.supervisors if s.id in allowed]
    else:
        ids = list(dict.fromkeys(body.supervisor_ids))
        if any(i not in allowed for i in ids):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Handledaren måste höra till projektets företag",
            )
        project.supervisors = [allowed[i] for i in ids]
    return [s for s in project.supervisors if s.id not in before]


def _notify_added(db: DbSession, user: User, project: Project, added: list[User]) -> None:
    for supervisor in added:
        notify(
            db,
            supervisor.id,
            f"{user.name} har bjudit in dig till projektet {project.name}",
            f"/projects/{project.id}",
        )


@router.get("", response_model=list[ProjectRead])
def list_projects(db: DbSession, user: Member) -> list[ProjectRead]:
    """Lärarens egna projekt, eller projekten handledaren är inbjuden till. Senast skapade
    först."""
    query = select(Project).options(*_LOAD).order_by(Project.created_at.desc(), Project.name)
    if user.role == UserRole.TEACHER:
        query = query.where(Project.owner_id == user.id, Project.school_id == user.school_id)
    else:
        query = query.join(
            project_supervisors, project_supervisors.c.project_id == Project.id
        ).where(project_supervisors.c.supervisor_id == user.id)
    return _read(db, user, list(db.scalars(query).all()))


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectWrite, db: DbSession, user: Teacher) -> ProjectRead:
    if user.school_id is None:
        raise _not_found()
    project = Project(
        school_id=user.school_id,
        owner=user,
        name=body.name,
        description=body.description,
        deadline=body.deadline,
        tags=body.tags,
        students=_students(db, user, body.student_ids or []),
        supervisors=[],
        completed_at=time.now() if body.completed else None,
    )
    added = _set_workplace_and_supervisors(db, user, project, body)
    db.add(project)
    db.flush()
    _notify_added(db, user, project, added)
    db.commit()
    return _read(db, user, [project])[0]


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: UUID, db: DbSession, user: Member) -> ProjectRead:
    return _read(db, user, [_project_for(db, user, project_id)])[0]


@router.put("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: UUID, body: ProjectWrite, db: DbSession, user: Member
) -> ProjectRead:
    """Ändrar projektet. Läraren som skapade det ändrar allt. En inbjuden handledare ändrar
    namn, beskrivning, slutdatum och taggar, och får 403 om hen skickar något annat."""
    project = _project_for(db, user, project_id)
    is_owner = project.owner_id == user.id
    owner_fields = (
        body.student_ids is not None
        or body.workplace_id is not None
        or body.clear_workplace
        or body.supervisor_ids is not None
        or body.completed is not None
    )
    if not is_owner and owner_fields:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Bara läraren som skapade projektet ändrar elever, företag och handledare",
        )
    project.name = body.name
    project.description = body.description
    project.deadline = body.deadline
    project.tags = body.tags
    if is_owner:
        if body.student_ids is not None:
            project.students = _students(db, user, body.student_ids)
        if body.completed is not None:
            if not body.completed:
                project.completed_at = None
            elif project.completed_at is None:
                project.completed_at = time.now()
        _notify_added(db, user, project, _set_workplace_and_supervisors(db, user, project, body))
    db.commit()
    return _read(db, user, [project])[0]


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: UUID, db: DbSession, user: Teacher) -> Response:
    """Tar bort projektet. Redovisningarna finns kvar, utan projekt."""
    project = _own_project(db, user, project_id)
    db.delete(project)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class ProjectReport(BaseModel):
    id: UUID
    student: Ref
    due_date: date
    submitted_at: datetime
    is_late: bool
    is_read: bool | None = Field(description="Om du (läraren) har läst den. null för handledare")
    comment_count: int
    answers: list[TextAnswer]


@router.get("/{project_id}/reports", response_model=list[ProjectReport])
def project_reports(
    project_id: UUID,
    db: DbSession,
    user: Member,
    student_id: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[ProjectReport]:
    """Inskickade redovisningar i projektet, senast inskickade först. Bara elever som är med i
    projektet."""
    project = _project_for(db, user, project_id)
    student_ids = [s.id for s in project.students if s.is_active]
    comment_count = (
        select(func.count())
        .where(ReportComment.report_id == Report.id)
        .scalar_subquery()
        .label("comment_count")
    )
    query = (
        select(Report, comment_count)
        .where(
            Report.project_id == project.id,
            Report.status == ReportStatus.SUBMITTED,
            Report.student_id.in_(student_ids),
        )
        .options(
            selectinload(Report.student),
            selectinload(Report.answers),
            selectinload(Report.form_version),
        )
        .order_by(Report.submitted_at.desc())
        .limit(limit)
    )
    if student_id is not None:
        query = query.where(Report.student_id == student_id)
    rows = db.execute(query).all()
    read: set[UUID] = set()
    if user.role == UserRole.TEACHER:
        read = set(
            db.scalars(
                select(ReportRead.report_id).where(
                    ReportRead.user_id == user.id,
                    ReportRead.report_id.in_([r.id for r, _ in rows]),
                )
            )
        )
    return [
        ProjectReport(
            id=report.id,
            student=_ref(report.student),
            due_date=report.due_date,
            submitted_at=report.submitted_at,
            is_late=_is_late(report.due_date, report.submitted_at),
            is_read=(report.id in read) if user.role == UserRole.TEACHER else None,
            comment_count=count,
            answers=text_answers(report, length=PROJECT_ANSWER_LENGTH),
        )
        for report, count in rows
    ]


@student_router.get("", response_model=list[ProjectRead])
def student_projects(student_id: UUID, db: DbSession, user: CanViewStudent) -> list[ProjectRead]:
    """Elevens projekt på skolan. Samma behörighet som elevsidan."""
    student = get_student_for(db, user, student_id)
    projects = db.scalars(
        select(Project)
        .join(project_students, project_students.c.project_id == Project.id)
        .where(project_students.c.student_id == student.id, Project.school_id == student.school_id)
        .options(*_LOAD)
        .order_by(Project.deadline.nulls_last(), Project.name)
    ).all()
    return _read(db, user, list(projects))


@me_router.get("", response_model=list[ProjectRead])
def my_projects(
    db: DbSession, user: Annotated[User, Depends(require_roles(UserRole.STUDENT))]
) -> list[ProjectRead]:
    """Elevens projekt som pågår, med närmast slutdatum först. För Min APL och för att koppla
    en redovisning till ett projekt."""
    projects = db.scalars(
        select(Project)
        .join(project_students, project_students.c.project_id == Project.id)
        .where(
            project_students.c.student_id == user.id,
            Project.school_id == user.school_id,
            Project.completed_at.is_(None),
        )
        .options(*_LOAD)
        .order_by(Project.deadline.nulls_last(), Project.name)
    ).all()
    return _read(db, user, list(projects))


class MyProjectReport(BaseModel):
    id: UUID
    due_date: date
    submitted_at: datetime
    comment_count: int
    excerpt: TextAnswer | None = Field(description="Första textsvaret, förkortat")


class MyProject(ProjectRead):
    reports: list[MyProjectReport] = Field(
        description="Elevens egna inskickade redovisningar i projektet, senaste först"
    )


MY_PROJECT_EXCERPT_LENGTH = 200


@me_router.get("/{project_id}", response_model=MyProject)
def my_project(
    project_id: UUID,
    db: DbSession,
    user: Annotated[User, Depends(require_roles(UserRole.STUDENT))],
) -> MyProject:
    """Ett projekt eleven är med i, med elevens egna redovisningar i projektet (Texas,
    2026-10-29). Andra elevers redovisningar syns inte. Är eleven inte med svarar den 404."""
    project = db.scalar(
        select(Project)
        .join(project_students, project_students.c.project_id == Project.id)
        .where(
            Project.id == project_id,
            project_students.c.student_id == user.id,
            Project.school_id == user.school_id,
        )
        .options(*_LOAD)
    )
    if project is None:
        raise _not_found()
    # Eleven räknar bara kommentarer hen ser, inte privata.
    comment_count = (
        select(func.count())
        .where(
            ReportComment.report_id == Report.id,
            ReportComment.visibility == CommentVisibility.ALL,
        )
        .scalar_subquery()
        .label("comment_count")
    )
    rows = db.execute(
        select(Report, comment_count)
        .where(
            Report.project_id == project.id,
            Report.student_id == user.id,
            Report.status == ReportStatus.SUBMITTED,
        )
        .options(selectinload(Report.answers), selectinload(Report.form_version))
        .order_by(Report.submitted_at.desc())
    ).all()
    reports = []
    for report, count in rows:
        excerpt = text_answers(report, limit=1, length=MY_PROJECT_EXCERPT_LENGTH)
        reports.append(
            MyProjectReport(
                id=report.id,
                due_date=report.due_date,
                submitted_at=report.submitted_at,
                comment_count=count,
                excerpt=excerpt[0] if excerpt else None,
            )
        )
    (read,) = _read(db, user, [project])
    return MyProject(**read.model_dump(), reports=reports)
