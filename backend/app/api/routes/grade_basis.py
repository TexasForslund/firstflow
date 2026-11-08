"""Underlag inför betyg (idé 13 steg 8, Texas skiss 2026-11-08).

Läraren öppnar underlaget från elevsidan med knappen Exportera. Det visar elevens mål per ämne
och nivå med redovisningar, projekt och vad eleven själv tycker, och Skolverkets betygskriterier
för E, C och A som stöd. Firstflow föreslår aldrig ett betyg. Läraren sätter betyget.

Behörighet: bara lärare som får se eleven, samma regel som elevsidans mål.
"""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.api.routes.goals import UNLINKED, GoalOverview, overview_groups
from app.api.routes.students import get_student_for
from app.db.session import DbSession
from app.models.project import Project, ProjectComment
from app.models.school_class import ClassTrack, SchoolClass, class_students
from app.models.syllabus import ClassSubject
from app.models.user import User, UserRole
from app.services import skolverket

router = APIRouter(prefix="/students/{student_id}/grade-basis", tags=["grade basis"])

Teacher = Annotated[User, Depends(require_roles(UserRole.TEACHER))]


class TextPart(BaseModel):
    text: str
    bold: bool


class Criterion(BaseModel):
    grade: str = Field(description="E, C eller A")
    paragraphs: list[list[TextPart]] = Field(description="Ett stycke per förmåga")


class GradeSubject(BaseModel):
    title: str = Field(description='T.ex. "Elteknik, nivå 1"')
    criteria: list[Criterion] = Field(description="Tom om Skolverket inte svarar")
    criteria_missing: bool = Field(description="Kriterierna kunde inte hämtas")
    goals: list[GoalOverview]


class BasisComment(BaseModel):
    project_name: str
    author_name: str
    author_role: str
    body: str
    created_at: datetime


class GradeBasis(BaseModel):
    student_name: str
    class_name: str | None
    track_name: str | None
    subjects: list[GradeSubject] = Field(description="Klassens ämnen med mål")
    other_goals: list[GoalOverview] = Field(description="Skolans mål, utan koppling")
    comments: list[BasisComment] = Field(description="Kommentarer om projekten som eleven ser")


def _criteria(db: Session, class_id: UUID | None, level_code: str | None) -> list[Criterion] | None:
    """Kriterierna för nivån eller kursen. None om de inte går att hämta."""
    if class_id is None or level_code is None:
        return None
    row = db.get(ClassSubject, (class_id, level_code))
    if row is None:
        return None
    try:
        data = skolverket.subject(db, row.subject_code)
    except skolverket.SkolverketUnavailable:
        return None
    found = skolverket.criteria(data, level_code)
    return [
        Criterion(
            grade=grade,
            paragraphs=[[TextPart(text=p.text, bold=p.bold) for p in para] for para in paragraphs],
        )
        for grade, paragraphs in found.items()
    ]


@router.get("", response_model=GradeBasis)
def grade_basis(student_id: UUID, db: DbSession, user: Teacher) -> GradeBasis:
    student = get_student_for(db, user, student_id)
    row = db.execute(
        select(SchoolClass, ClassTrack)
        .join(class_students, class_students.c.class_id == SchoolClass.id)
        .outerjoin(ClassTrack, ClassTrack.id == class_students.c.track_id)
        .where(class_students.c.student_id == student.id)
    ).first()
    school_class, track = (row[0], row[1]) if row else (None, None)

    subjects: list[GradeSubject] = []
    other: list[GoalOverview] = []
    for title, items in overview_groups(db, user, student):
        if title == UNLINKED:
            other = [o for _, o in items]
            continue
        goal = items[0][0]
        found = _criteria(db, goal.class_id, goal.level_code)
        subjects.append(
            GradeSubject(
                title=title,
                criteria=found or [],
                criteria_missing=found is None,
                goals=[o for _, o in items],
            )
        )

    comments = db.execute(
        select(ProjectComment, Project.name)
        .join(Project, Project.id == ProjectComment.project_id)
        .where(
            ProjectComment.student_id == student.id,
            ProjectComment.visibility == "all",
            Project.school_id == student.school_id,
        )
        .order_by(ProjectComment.created_at)
    ).all()
    db.commit()
    return GradeBasis(
        student_name=student.name,
        class_name=school_class.name if school_class else None,
        track_name=track.name if track else None,
        subjects=subjects,
        other_goals=other,
        comments=[
            BasisComment(
                project_name=name,
                author_name=c.author.name,
                author_role="Handledare" if c.author.role == UserRole.SUPERVISOR else "Lärare",
                body=c.body,
                created_at=c.created_at,
            )
            for c, name in comments
        ],
    )
