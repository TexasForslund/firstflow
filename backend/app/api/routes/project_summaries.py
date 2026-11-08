"""Projektets sammanfattning (idé 12:6 steg 2, Texas 2026-11-07 och 2026-11-08).

När läraren eller handledaren markerar projektet som klart får eleven kortet "Projektet är
klart!" med fyra korta frågor: hur det gick (1–5 stjärnor), vad eleven är mest nöjd med (en
mening), vilka av projektets mål eleven tycker att den visade och bilder på slutresultatet
(valfritt, högst 4). Det är frivilligt. Varje elev svarar själv.

Påminnelsen: Firstflow har inga jobb som körs på schemat, så påminnelsen skapas första gången
någon öppnar projektets sammanfattningar eller elevens kort efter tre dagar. Eleven får en notis.

Behörighet: eleven ser och ändrar bara sin egen sammanfattning i projekt hen är med i. Läraren
som äger projektet och inbjudna handledare ser alla elevers.
"""

from datetime import datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.api.routes.goals import GoalRead, read_goal
from app.api.routes.invitations import notify
from app.api.routes.projects import Member, Ref, _project_for
from app.core import time
from app.db.session import DbSession
from app.models.project import (
    Project,
    ProjectSummary,
    ProjectSummaryImage,
    ProjectSummaryReminder,
    project_students,
)
from app.models.user import User, UserRole
from app.services.images import MAX_UPLOAD_BYTES, ImageError, compress

router = APIRouter(prefix="/projects/{project_id}", tags=["project summaries"])
me_router = APIRouter(prefix="/me/project-summaries", tags=["project summaries"])

StudentUser = Annotated[User, Depends(require_roles(UserRole.STUDENT))]

MAX_IMAGES = 4
REMIND_AFTER = timedelta(days=3)
Best = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


class SummaryRead(BaseModel):
    rating: int = Field(description="1–5 stjärnor")
    best: str = Field(description="Det eleven är mest nöjd med")
    goal_ids: list[UUID] = Field(description="Målen eleven tycker att den visade")
    image_ids: list[UUID]
    created_at: datetime


class SummaryWrite(BaseModel):
    rating: int = Field(ge=1, le=5)
    best: Best
    goal_ids: list[UUID] = Field(default_factory=list, max_length=30)
    image_ids: list[UUID] = Field(default_factory=list, max_length=MAX_IMAGES)


class StudentSummary(BaseModel):
    student: Ref
    summary: SummaryRead | None
    reminded_at: datetime | None = Field(description="När eleven fick påminnelsen")


class PendingSummary(BaseModel):
    project_id: UUID
    project_name: str
    completed_at: datetime


class SummaryForm(BaseModel):
    project_id: UUID
    project_name: str
    completed: bool = Field(description="Eleven kan sammanfatta när projektet är klart")
    goals: list[GoalRead] = Field(description="Projektets mål, klassens mål först")
    summary: SummaryRead | None


class ImageRead(BaseModel):
    id: UUID
    width: int
    height: int


def _read(summary: ProjectSummary) -> SummaryRead:
    return SummaryRead(
        rating=summary.rating,
        best=summary.best,
        goal_ids=[g.id for g in summary.goals],
        image_ids=[i.id for i in summary.images],
        created_at=summary.created_at,
    )


def _summaries(db: Session, project_id: UUID) -> dict[UUID, ProjectSummary]:
    rows = db.scalars(
        select(ProjectSummary)
        .where(ProjectSummary.project_id == project_id)
        .options(selectinload(ProjectSummary.goals), selectinload(ProjectSummary.images))
    )
    return {s.student_id: s for s in rows}


def remind_due(db: Session, project: Project) -> dict[UUID, datetime]:
    """Påminner elever som inte har sammanfattat tre dagar efter att projektet blev klart. En
    påminnelse per elev. Ger när varje elev fick sin påminnelse."""
    reminded = {
        r.student_id: r.reminded_at
        for r in db.scalars(
            select(ProjectSummaryReminder).where(ProjectSummaryReminder.project_id == project.id)
        )
    }
    if project.completed_at is None or time.now() - project.completed_at < REMIND_AFTER:
        return reminded
    done = set(
        db.scalars(select(ProjectSummary.student_id).where(ProjectSummary.project_id == project.id))
    )
    for student in project.students:
        if student.id in done or student.id in reminded or not student.is_active:
            continue
        now = time.now()
        db.add(
            ProjectSummaryReminder(project_id=project.id, student_id=student.id, reminded_at=now)
        )
        notify(
            db,
            student.id,
            f"Påminnelse: sammanfatta projektet {project.name}. Det tar en minut.",
            f"/my-projects/{project.id}/summary",
        )
        reminded[student.id] = now
    return reminded


def notify_completed(db: Session, project: Project) -> None:
    """Eleverna får en notis när projektet blir klart."""
    for student in project.students:
        if student.is_active:
            notify(
                db,
                student.id,
                f"Projektet {project.name} är klart! Sammanfatta det med fyra korta frågor.",
                f"/my-projects/{project.id}/summary",
            )


# --- Läraren och handledaren --------------------------------------------------------------


@router.get("/summaries", response_model=list[StudentSummary])
def project_summaries(project_id: UUID, db: DbSession, user: Member) -> list[StudentSummary]:
    """Varje elevs sammanfattning, eller att eleven inte har svarat än och när påminnelsen
    skickades."""
    project = _project_for(db, user, project_id)
    reminded = remind_due(db, project)
    found = _summaries(db, project.id)
    db.commit()
    return [
        StudentSummary(
            student=Ref(id=s.id, name=s.name),
            summary=_read(found[s.id]) if s.id in found else None,
            reminded_at=reminded.get(s.id),
        )
        for s in project.students
        if s.is_active
    ]


def _image_response(image: ProjectSummaryImage) -> Response:
    return Response(
        image.data, media_type="image/webp", headers={"Cache-Control": "private, max-age=86400"}
    )


@router.get(
    "/summary-images/{image_id}",
    response_class=Response,
    responses={200: {"content": {"image/webp": {}}}},
)
def get_summary_image(project_id: UUID, image_id: UUID, db: DbSession, user: Member) -> Response:
    project = _project_for(db, user, project_id)
    image = db.get(ProjectSummaryImage, image_id)
    if image is None or image.project_id != project.id or image.summary_id is None:
        raise _not_found()
    return _image_response(image)


# --- Eleven ------------------------------------------------------------------------------


def _my_project(db: Session, user: User, project_id: UUID) -> Project:
    project = db.scalar(
        select(Project)
        .join(project_students, project_students.c.project_id == Project.id)
        .where(
            Project.id == project_id,
            project_students.c.student_id == user.id,
            Project.school_id == user.school_id,
        )
        .options(selectinload(Project.goals), selectinload(Project.students))
    )
    if project is None:
        raise _not_found()
    return project


@me_router.get("", response_model=list[PendingSummary])
def pending_summaries(db: DbSession, user: StudentUser) -> list[PendingSummary]:
    """Klara projekt som eleven inte har sammanfattat, senast klara först. Visas som kortet
    "Projektet är klart!"."""
    done = select(ProjectSummary.project_id).where(ProjectSummary.student_id == user.id)
    projects = db.scalars(
        select(Project)
        .join(project_students, project_students.c.project_id == Project.id)
        .where(
            project_students.c.student_id == user.id,
            Project.school_id == user.school_id,
            Project.completed_at.is_not(None),
            Project.id.not_in(done),
        )
        .order_by(Project.completed_at.desc())
    ).all()
    return [
        PendingSummary(project_id=p.id, project_name=p.name, completed_at=p.completed_at)
        for p in projects
        if p.completed_at is not None
    ]


def _sorted_goals(project: Project) -> list[GoalRead]:
    goals = sorted(project.goals, key=lambda g: (g.class_id is None, g.subject_name or "", g.name))
    return [read_goal(g) for g in goals]


@me_router.get("/{project_id}", response_model=SummaryForm)
def my_summary(project_id: UUID, db: DbSession, user: StudentUser) -> SummaryForm:
    """Frågorna för projektet, med elevens svar om hen redan har sammanfattat."""
    project = _my_project(db, user, project_id)
    summary = _summaries(db, project.id).get(user.id)
    return SummaryForm(
        project_id=project.id,
        project_name=project.name,
        completed=project.completed_at is not None,
        goals=_sorted_goals(project),
        summary=_read(summary) if summary else None,
    )


@me_router.put("/{project_id}", response_model=SummaryRead)
def save_summary(
    project_id: UUID, body: SummaryWrite, db: DbSession, user: StudentUser
) -> SummaryRead:
    """Sparar elevens sammanfattning. Eleven kan ändra den efteråt."""
    project = _my_project(db, user, project_id)
    if project.completed_at is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Projektet är inte klart än. Läraren markerar det."
        )
    goals = {g.id: g for g in project.goals}
    if any(i not in goals for i in body.goal_ids):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Målet finns inte i projektet"
        )
    images = {
        i.id: i
        for i in db.scalars(
            select(ProjectSummaryImage).where(
                ProjectSummaryImage.project_id == project.id,
                ProjectSummaryImage.student_id == user.id,
            )
        )
    }
    if any(i not in images for i in body.image_ids):
        raise _not_found()
    summary = _summaries(db, project.id).get(user.id)
    if summary is None:
        summary = ProjectSummary(project_id=project.id, student_id=user.id, rating=body.rating)
        db.add(summary)
    summary.rating = body.rating
    summary.best = body.best
    summary.goals = [goals[i] for i in dict.fromkeys(body.goal_ids)]
    db.flush()
    keep = set(body.image_ids)
    for image in images.values():
        if image.id in keep:
            image.summary_id = summary.id
        else:
            db.delete(image)
    db.commit()
    db.expire_all()
    return _read(_summaries(db, project.id)[user.id])


@me_router.post(
    "/{project_id}/images", response_model=ImageRead, status_code=status.HTTP_201_CREATED
)
def upload_summary_image(
    project_id: UUID,
    db: DbSession,
    user: StudentUser,
    file: Annotated[UploadFile, File(description="En bild, högst 20 MB")],
) -> ImageRead:
    """Laddar upp en bild på slutresultatet. Bilden görs mindre och sparas som WebP utan
    platsdata. Den hör till sammanfattningen när eleven skickar den med bildens id."""
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Bilden är för stor")
    project = _my_project(db, user, project_id)
    count = db.scalar(
        select(func.count()).where(
            ProjectSummaryImage.project_id == project.id,
            ProjectSummaryImage.student_id == user.id,
        )
    )
    # Plats för de fyra som används och några som eleven har bytt ut men inte sparat än.
    if (count or 0) >= MAX_IMAGES * 3:
        db.execute(
            delete(ProjectSummaryImage).where(
                ProjectSummaryImage.project_id == project.id,
                ProjectSummaryImage.student_id == user.id,
                ProjectSummaryImage.summary_id.is_(None),
            )
        )
    try:
        webp, width, height = compress(data)
    except ImageError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from None
    image = ProjectSummaryImage(
        project_id=project.id,
        student_id=user.id,
        width=width,
        height=height,
        size=len(webp),
        data=webp,
    )
    db.add(image)
    db.commit()
    return ImageRead(id=image.id, width=width, height=height)


@me_router.get(
    "/{project_id}/images/{image_id}",
    response_class=Response,
    responses={200: {"content": {"image/webp": {}}}},
)
def get_my_summary_image(
    project_id: UUID, image_id: UUID, db: DbSession, user: StudentUser
) -> Response:
    image = db.get(ProjectSummaryImage, image_id)
    if image is None or image.project_id != project_id or image.student_id != user.id:
        raise _not_found()
    return _image_response(image)
