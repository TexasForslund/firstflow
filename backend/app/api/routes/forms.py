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
from sqlalchemy.dialects.postgresql import insert

from app.api.routes.classes import CanEditClasses, CanViewClasses, get_accessible_class
from app.db.session import DbSession
from app.models.report import ClassForm, FormVersion
from app.models.user import User
from app.services.report_forms import FormContent, dump_questions, parse_questions

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


def _canonical(raw: list[Any]) -> list[Any]:
    """Frågorna med alla standardvärden ifyllda, så att gamla och nya versioner går att jämföra."""
    return dump_questions(parse_questions(raw))


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
        has_unpublished_changes=_canonical(draft) != _canonical(published),
    )


def draft_questions(db: DbSession, class_id: UUID) -> list[Any]:
    """Klassens frågor som läraren ser dem: utkastet, annars den senast publicerade versionen."""
    return _draft_questions(db, class_id, latest_version(db, class_id))


def replace_draft(db: DbSession, class_id: UUID, questions: list[Any], user: User) -> FormRead:
    """Ersätter klassens utkast, t.ex. med en mall. Eleverna ser inget förrän det publiceras."""
    _save(db, class_id, questions, user)
    db.commit()
    return _read(db, class_id)


@router.get("", response_model=FormRead)
def get_form(class_id: UUID, db: DbSession, user: CanViewClasses) -> FormRead:
    """Utkastet och vilken version som är publicerad."""
    get_accessible_class(db, user, class_id)
    return _read(db, class_id)


@router.put("", response_model=FormRead)
def save_draft(class_id: UUID, body: FormContent, db: DbSession, user: CanEditClasses) -> FormRead:
    """Sparar hela utkastet: frågorna i ordning. Eleverna ser inget förrän det publiceras."""
    get_accessible_class(db, user, class_id)
    _check_types_unchanged(db, class_id, body)
    _save(db, class_id, dump_questions(body.questions), user)
    db.commit()
    return _read(db, class_id)


def _check_types_unchanged(db: DbSession, class_id: UUID, body: FormContent) -> None:
    """En publicerad fråga får inte byta typ. Då går gamla svar inte att tolka."""
    published: dict[str, str] = {}
    for questions in db.scalars(
        select(FormVersion.questions).where(FormVersion.class_id == class_id)
    ):
        for question in questions:
            published[question["id"]] = question["type"]
    for question in body.questions:
        old_type = published.get(str(question.id))
        if old_type is not None and old_type != question.type:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f'Frågan "{question.title}" är redan publicerad som en annan frågetyp. '
                "Lägg till en ny fråga i stället.",
            )


def _save(db: DbSession, class_id: UUID, questions: list[Any], user: User) -> None:
    # Två samtidiga sparningar (t.ex. två flikar) ska inte ge fel. Den sista vinner.
    db.execute(
        insert(ClassForm)
        .values(class_id=class_id, draft=questions, updated_by_id=user.id)
        .on_conflict_do_update(
            index_elements=[ClassForm.class_id],
            set_={"draft": questions, "updated_by_id": user.id, "updated_at": func.now()},
        )
    )
    db.expire_all()


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
    if latest is not None and _canonical(draft) == _canonical(latest.questions):
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
