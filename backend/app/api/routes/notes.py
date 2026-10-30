"""Anteckningar om eleven (B18). Se beslut i `app/models/note.py`.

Behörighet:
- Handledaren läser och skriver anteckningar om elever hen har i en pågående placering. Hen ser
  bara sina egna anteckningar, så att en ny handledare inte ser en tidigare handledares.
- Läraren som får se eleven (samma regel som elevsidan) läser alla anteckningar men skriver inte.
- Eleven, skoladmin, rektor och SYV ser dem inte. Allt annat svarar 404.
"""

from datetime import datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select

from app.api.deps import require_roles
from app.api.routes.students import get_student_for
from app.core import time
from app.db.session import DbSession
from app.models.note import NoteTag, StudentNote
from app.models.placement import Placement
from app.models.user import User, UserRole

router = APIRouter(prefix="/students/{student_id}/notes", tags=["notes"])

Supervisor = Annotated[User, Depends(require_roles(UserRole.SUPERVISOR))]
Reader = Annotated[User, Depends(require_roles(UserRole.TEACHER, UserRole.SUPERVISOR))]

# Så länge handledaren kan ändra eller ta bort en anteckning (Texas, 2026-10-30).
EDIT_WINDOW = timedelta(hours=24)

Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class NoteAuthor(BaseModel):
    id: UUID
    name: str


class NoteRead(BaseModel):
    id: UUID
    tag: NoteTag
    body: str
    author: NoteAuthor
    created_at: datetime
    updated_at: datetime | None
    can_edit: bool = Field(description="Om du kan ändra eller ta bort den just nu")


class NoteWrite(BaseModel):
    tag: NoteTag
    body: Body


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


def _supervises_now(db: DbSession, user: User, student_id: UUID) -> bool:
    today = time.today()
    return (
        db.scalar(
            select(Placement.id).where(
                Placement.student_id == student_id,
                Placement.supervisor_id == user.id,
                Placement.start_date <= today,
                Placement.end_date >= today,
            )
        )
        is not None
    )


def _check_access(db: DbSession, user: User, student_id: UUID) -> None:
    if user.role == UserRole.SUPERVISOR:
        if not _supervises_now(db, user, student_id):
            raise _not_found()
        return
    get_student_for(db, user, student_id)


def _can_edit(user: User, note: StudentNote) -> bool:
    return note.author_id == user.id and time.now() - note.created_at < EDIT_WINDOW


def _read(user: User, note: StudentNote) -> NoteRead:
    return NoteRead(
        id=note.id,
        tag=note.tag,
        body=note.body,
        author=NoteAuthor(id=note.author.id, name=note.author.name),
        created_at=note.created_at,
        updated_at=note.updated_at,
        can_edit=_can_edit(user, note),
    )


def _own_note(db: DbSession, user: User, student_id: UUID, note_id: UUID) -> StudentNote:
    """Handledarens egen anteckning som fortfarande går att ändra. 404 annars, 409 när
    tiden har gått ut."""
    _check_access(db, user, student_id)
    note = db.get(StudentNote, note_id)
    if note is None or note.student_id != student_id or note.author_id != user.id:
        raise _not_found()
    if not _can_edit(user, note):
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Anteckningen går bara att ändra i 24 timmar"
        )
    return note


@router.get("", response_model=list[NoteRead])
def list_notes(student_id: UUID, db: DbSession, user: Reader) -> list[NoteRead]:
    """Anteckningar om eleven, senaste först. Handledaren ser bara sina egna."""
    _check_access(db, user, student_id)
    query = (
        select(StudentNote)
        .where(StudentNote.student_id == student_id)
        .order_by(StudentNote.created_at.desc())
    )
    if user.role == UserRole.SUPERVISOR:
        query = query.where(StudentNote.author_id == user.id)
    return [_read(user, note) for note in db.scalars(query)]


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(student_id: UUID, body: NoteWrite, db: DbSession, user: Supervisor) -> NoteRead:
    """Handledaren skriver en anteckning om en elev hen har just nu."""
    _check_access(db, user, student_id)
    note = StudentNote(
        student_id=student_id,
        author_id=user.id,
        tag=body.tag,
        body=body.body,
        created_at=time.now(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _read(user, note)


@router.put("/{note_id}", response_model=NoteRead)
def update_note(
    student_id: UUID, note_id: UUID, body: NoteWrite, db: DbSession, user: Supervisor
) -> NoteRead:
    note = _own_note(db, user, student_id, note_id)
    note.tag = body.tag
    note.body = body.body
    note.updated_at = time.now()
    db.commit()
    return _read(user, note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(student_id: UUID, note_id: UUID, db: DbSession, user: Supervisor) -> Response:
    note = _own_note(db, user, student_id, note_id)
    db.delete(note)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
