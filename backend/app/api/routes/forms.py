"""Klassens frågeformulär för veckoredovisningar (B5).

Läraren arbetar i ett utkast och publicerar det som en ny version ("Publicera ändringar").
Eleverna ser bara publicerade versioner. En redovisning som redan har startats behåller
versionen den startades med.

Behörighet som för klassen: läraren för klassen och skoladmin ändrar, rektor och superadmin
ser. Se app/api/routes/classes.py.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.routes.classes import CanEditClasses, CanViewClasses, get_accessible_class
from app.db.session import DbSession
from app.models.report import ClassForm, FormVersion
from app.models.user import User
from app.services.report_forms import FormContent, dump_questions

router = APIRouter(prefix="/classes/{class_id}/form", tags=["forms"])


class FormRead(BaseModel):
    draft: FormContent
    published_version: int | None
    published_at: datetime | None
    has_unpublished_changes: bool


def latest_version(db: DbSession, class_id: UUID) -> FormVersion | None:
    return db.scalar(
        select(FormVersion)
        .where(FormVersion.class_id == class_id)
        .order_by(FormVersion.version.desc())
        .limit(1)
    )


def _draft_questions(db: DbSession, class_id: UUID, latest: FormVersion | None) -> list[Any]:
    form = db.get(ClassForm, class_id)
    if form is not None:
        return form.draft
    return latest.questions if latest else []


def _read(db: DbSession, class_id: UUID) -> FormRead:
    latest = latest_version(db, class_id)
    draft = _draft_questions(db, class_id, latest)
    published = latest.questions if latest else []
    return FormRead(
        draft=FormContent.model_validate({"questions": draft}),
        published_version=latest.version if latest else None,
        published_at=latest.published_at if latest else None,
        has_unpublished_changes=draft != published,
    )


@router.get("", response_model=FormRead)
def get_form(class_id: UUID, db: DbSession, user: CanViewClasses) -> FormRead:
    """Utkastet och vilken version som är publicerad."""
    get_accessible_class(db, user, class_id)
    return _read(db, class_id)


@router.put("", response_model=FormRead)
def save_draft(class_id: UUID, body: FormContent, db: DbSession, user: CanEditClasses) -> FormRead:
    """Sparar hela utkastet: frågorna i ordning. Eleverna ser inget förrän det publiceras."""
    get_accessible_class(db, user, class_id)
    _save(db, class_id, dump_questions(body.questions), user)
    db.commit()
    return _read(db, class_id)


def _save(db: DbSession, class_id: UUID, questions: list[Any], user: User) -> None:
    form = db.get(ClassForm, class_id)
    if form is None:
        db.add(ClassForm(class_id=class_id, draft=questions, updated_by_id=user.id))
    else:
        form.draft = questions
        form.updated_by_id = user.id
    db.flush()


@router.post("/publish", response_model=FormRead)
def publish(class_id: UUID, db: DbSession, user: CanEditClasses) -> FormRead:
    """Publicerar utkastet som en ny version. Nya redovisningar får den här versionen."""
    get_accessible_class(db, user, class_id)
    # Lås klassens utkast så att två samtidiga publiceringar inte får samma versionsnummer.
    form = db.scalar(select(ClassForm).where(ClassForm.class_id == class_id).with_for_update())
    latest = latest_version(db, class_id)
    draft = form.draft if form else (latest.questions if latest else [])
    if not draft:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Lägg till minst en fråga"
        )
    if latest is not None and draft == latest.questions:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Det finns inga ändringar att publicera"
        )
    next_version = (
        db.scalar(select(func.max(FormVersion.version)).where(FormVersion.class_id == class_id))
        or 0
    ) + 1
    db.add(
        FormVersion(
            class_id=class_id, version=next_version, questions=draft, published_by_id=user.id
        )
    )
    db.commit()
    return _read(db, class_id)


@router.post("/discard", response_model=FormRead)
def discard_changes(class_id: UUID, db: DbSession, user: CanEditClasses) -> FormRead:
    """Kastar ändringarna i utkastet och går tillbaka till den publicerade versionen."""
    get_accessible_class(db, user, class_id)
    latest = latest_version(db, class_id)
    if latest is None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Inget är publicerat än")
    form = db.get(ClassForm, class_id)
    if form is not None:
        db.delete(form)
    db.commit()
    return _read(db, class_id)
