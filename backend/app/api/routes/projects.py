"""Projekt (B12): läraren skapar projekt och kopplar elever. Redovisningar kan höra till ett
projekt.

Beslut (Texas, 2026-10-26): ett projekt har namn, beskrivning, valfri deadline och taggar i
fritext. Ett projekt kan ha flera elever. Läraren som skapade projektet ändrar och tar bort det.
Handledare och SYV kommer in senare.

Behörighet: läraren ser och ändrar sina egna projekt. Eleverna måste vara elever läraren får se
(samma regel som elevsidan). Elevens projekt syns på elevsidan med elevsidans behörighet.
"""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, StringConstraints, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles, require_same_school
from app.api.routes.students import CanViewStudent, get_student_for
from app.db.session import DbSession
from app.models.project import Project, project_students
from app.models.report import Report, ReportStatus
from app.models.user import User, UserRole

router = APIRouter(prefix="/projects", tags=["projects"])
student_router = APIRouter(prefix="/students/{student_id}/projects", tags=["projects"])

Teacher = Annotated[User, Depends(require_roles(UserRole.TEACHER))]

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
    report_count: int = Field(description="Inskickade redovisningar kopplade till projektet")
    is_owner: bool


class ProjectWrite(BaseModel):
    name: Name
    description: str | None = Field(default=None, max_length=2000)
    deadline: date | None = None
    tags: list[Tag] = Field(default_factory=list, max_length=10)
    student_ids: list[UUID] = Field(default_factory=list, max_length=100)

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


def _read(db: DbSession, user: User, projects: list[Project]) -> list[ProjectRead]:
    counts = dict(
        db.execute(
            select(Report.project_id, func.count(Report.id))
            .where(
                Report.project_id.in_([p.id for p in projects]),
                Report.status == ReportStatus.SUBMITTED,
            )
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
            students=[Ref(id=s.id, name=s.name) for s in p.students if s.is_active],
            report_count=counts.get(p.id, 0),
            is_owner=p.owner_id == user.id,
        )
        for p in projects
    ]


def _own_project(db: DbSession, user: User, project_id: UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.owner_id != user.id:
        raise _not_found()
    require_same_school(user, project.school_id)
    return project


def _students(db: DbSession, user: User, ids: list[UUID]) -> list[User]:
    """Eleverna om läraren får se alla, annars 404 (samma regel som elevsidan)."""
    return [get_student_for(db, user, student_id) for student_id in dict.fromkeys(ids)]


@router.get("", response_model=list[ProjectRead])
def list_projects(db: DbSession, user: Teacher) -> list[ProjectRead]:
    """Lärarens egna projekt, senast skapade först."""
    projects = db.scalars(
        select(Project)
        .where(Project.owner_id == user.id, Project.school_id == user.school_id)
        .options(selectinload(Project.students))
        .order_by(Project.created_at.desc(), Project.name)
    ).all()
    return _read(db, user, list(projects))


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectWrite, db: DbSession, user: Teacher) -> ProjectRead:
    if user.school_id is None:
        raise _not_found()
    project = Project(
        school_id=user.school_id,
        owner_id=user.id,
        name=body.name,
        description=body.description,
        deadline=body.deadline,
        tags=body.tags,
        students=_students(db, user, body.student_ids),
    )
    db.add(project)
    db.commit()
    return _read(db, user, [project])[0]


@router.put("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: UUID, body: ProjectWrite, db: DbSession, user: Teacher
) -> ProjectRead:
    """Ersätter projektets uppgifter och elever. Bara läraren som skapade projektet."""
    project = _own_project(db, user, project_id)
    project.name = body.name
    project.description = body.description
    project.deadline = body.deadline
    project.tags = body.tags
    project.students = _students(db, user, body.student_ids)
    db.commit()
    return _read(db, user, [project])[0]


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: UUID, db: DbSession, user: Teacher) -> Response:
    """Tar bort projektet. Redovisningarna finns kvar, utan projekt."""
    project = _own_project(db, user, project_id)
    db.delete(project)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@student_router.get("", response_model=list[ProjectRead])
def student_projects(student_id: UUID, db: DbSession, user: CanViewStudent) -> list[ProjectRead]:
    """Elevens projekt på skolan. Samma behörighet som elevsidan."""
    student = get_student_for(db, user, student_id)
    projects = db.scalars(
        select(Project)
        .join(project_students, project_students.c.project_id == Project.id)
        .where(project_students.c.student_id == student.id, Project.school_id == student.school_id)
        .options(selectinload(Project.students))
        .order_by(Project.deadline.nulls_last(), Project.name)
    ).all()
    return _read(db, user, list(projects))
