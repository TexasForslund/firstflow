"""Inriktningar i klassen (Texas, 2026-10-30), t.ex. Dator och Programmering.

Läraren skapar inriktningar, sätter en inriktning per elev och kan visa vissa frågor bara för
vissa inriktningar (`tracks` på frågan). Samma behörighet som klassen: alla som får se klassen
ser inriktningarna, lärare och skoladmin ändrar dem.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.api.routes.classes import CanEditClasses, CanViewClasses, get_accessible_class
from app.api.routes.forms import draft_questions, replace_draft
from app.db.session import DbSession
from app.models.school_class import ClassTrack, class_students

router = APIRouter(prefix="/classes/{class_id}", tags=["tracks"])

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class TrackRead(BaseModel):
    id: UUID
    name: str
    student_ids: list[UUID] = Field(description="Elever med inriktningen")


class TrackCreate(BaseModel):
    name: Name


class StudentTrack(BaseModel):
    track_id: UUID | None = Field(description="null = ingen inriktning")


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


def class_tracks(db: DbSession, class_id: UUID) -> list[TrackRead]:
    tracks = db.scalars(
        select(ClassTrack).where(ClassTrack.class_id == class_id).order_by(ClassTrack.name)
    ).all()
    members: dict[UUID, list[UUID]] = {}
    for student_id, track_id in db.execute(
        select(class_students.c.student_id, class_students.c.track_id).where(
            class_students.c.class_id == class_id, class_students.c.track_id.is_not(None)
        )
    ):
        members.setdefault(track_id, []).append(student_id)
    return [TrackRead(id=t.id, name=t.name, student_ids=members.get(t.id, [])) for t in tracks]


@router.get("/tracks", response_model=list[TrackRead])
def list_tracks(class_id: UUID, db: DbSession, user: CanViewClasses) -> list[TrackRead]:
    get_accessible_class(db, user, class_id)
    return class_tracks(db, class_id)


@router.post("/tracks", response_model=list[TrackRead], status_code=status.HTTP_201_CREATED)
def create_track(
    class_id: UUID, body: TrackCreate, db: DbSession, user: CanEditClasses
) -> list[TrackRead]:
    """Skapar en inriktning och svarar med klassens alla inriktningar."""
    get_accessible_class(db, user, class_id)
    db.add(ClassTrack(class_id=class_id, name=body.name))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Klassen har redan en inriktning med det namnet"
        ) from None
    return class_tracks(db, class_id)


@router.delete("/tracks/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_track(class_id: UUID, track_id: UUID, db: DbSession, user: CanEditClasses) -> Response:
    """Tar bort inriktningen. Eleverna får ingen inriktning, och utkastets frågor slutar gälla
    den. Publicerade frågor ändras först när läraren publicerar igen."""
    get_accessible_class(db, user, class_id)
    track = db.get(ClassTrack, track_id)
    if track is None or track.class_id != class_id:
        raise _not_found()
    questions = draft_questions(db, class_id)
    if any(str(track_id) in q.get("tracks", []) for q in questions):
        cleaned = [
            {**q, "tracks": [t for t in q.get("tracks", []) if t != str(track_id)]}
            for q in questions
        ]
        replace_draft(db, class_id, cleaned, user)
    db.delete(track)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/students/{student_id}/track", response_model=list[TrackRead])
def set_student_track(
    class_id: UUID, student_id: UUID, body: StudentTrack, db: DbSession, user: CanEditClasses
) -> list[TrackRead]:
    """Sätter elevens inriktning i klassen. Svarar med klassens alla inriktningar."""
    get_accessible_class(db, user, class_id)
    if body.track_id is not None:
        track = db.get(ClassTrack, body.track_id)
        if track is None or track.class_id != class_id:
            raise _not_found()
    result = db.execute(
        update(class_students)
        .where(class_students.c.class_id == class_id, class_students.c.student_id == student_id)
        .values(track_id=body.track_id)
    )
    if result.rowcount == 0:
        raise _not_found()
    db.commit()
    return class_tracks(db, class_id)
