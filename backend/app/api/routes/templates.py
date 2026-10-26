"""Frågemallar (B5b): skolans mallar och lärarens egna.

- Skoladmin skapar, byter namn på och tar bort skolans mallar. Alla lärare på skolan ser dem.
- Läraren skapar och hanterar egna mallar. De syns bara för läraren.
- En mall skapas från en klass frågor ("Spara som mall"). Mallen används i en klass med
  `POST /api/classes/{class_id}/form/apply-template` (app/api/routes/forms.py).

Se docs/design/fragor-typeform.md.
"""

from datetime import datetime
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select

from app.api.deps import require_roles, require_same_school
from app.api.routes.classes import get_accessible_class
from app.api.routes.forms import FormRead, draft_questions, replace_draft
from app.db.session import DbSession
from app.models.template import QuestionTemplate
from app.models.user import User, UserRole
from app.services.report_forms import FormContent, copy_with_new_ids

router = APIRouter(prefix="/templates", tags=["templates"])
class_router = APIRouter(prefix="/classes/{class_id}/form", tags=["templates"])

CanUseTemplates = Annotated[User, Depends(require_roles(UserRole.SCHOOL_ADMIN, UserRole.TEACHER))]


class TemplateScope(StrEnum):
    SCHOOL = "school"  # skolans mall, skapas av skoladmin
    PERSONAL = "personal"  # lärarens egen mall


class TemplateRead(BaseModel):
    id: UUID
    name: str
    scope: TemplateScope
    content: FormContent
    updated_at: datetime


class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    class_id: UUID = Field(description="Klassen vars frågor (utkastet) sparas som mall")

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Mallen måste ha ett namn")
        return name


class TemplateRename(BaseModel):
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Mallen måste ha ett namn")
        return name


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


def template_read(template: QuestionTemplate) -> TemplateRead:
    return TemplateRead(
        id=template.id,
        name=template.name,
        scope=TemplateScope.SCHOOL if template.owner_id is None else TemplateScope.PERSONAL,
        content=FormContent.model_validate({"questions": template.questions}),
        updated_at=template.updated_at,
    )


def get_visible_template(db: DbSession, user: User, template_id: UUID) -> QuestionTemplate:
    """Mallen om användaren får använda den: skolans mallar och egna mallar. Annars 404."""
    template = db.get(QuestionTemplate, template_id)
    if template is None:
        raise _not_found()
    require_same_school(user, template.school_id)
    if template.owner_id is not None and template.owner_id != user.id:
        raise _not_found()
    return template


def _get_editable_template(db: DbSession, user: User, template_id: UUID) -> QuestionTemplate:
    """Skoladmin ändrar skolans mallar, läraren sina egna. En lärare som försöker ändra en
    skolmall får 403, eftersom hen ser den."""
    template = get_visible_template(db, user, template_id)
    if template.owner_id is None and user.role != UserRole.SCHOOL_ADMIN:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, detail="Bara skolans administratör ändrar skolans mallar"
        )
    return template


@router.get("", response_model=list[TemplateRead])
def list_templates(db: DbSession, user: CanUseTemplates) -> list[TemplateRead]:
    """Skolans mallar och användarens egna, i bokstavsordning. Skolans först."""
    templates = db.scalars(
        select(QuestionTemplate)
        .where(
            QuestionTemplate.school_id == user.school_id,
            or_(QuestionTemplate.owner_id.is_(None), QuestionTemplate.owner_id == user.id),
        )
        .order_by(QuestionTemplate.owner_id.is_not(None), QuestionTemplate.name)
    )
    return [template_read(t) for t in templates]


@router.post("", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
def create_template(body: TemplateCreate, db: DbSession, user: CanUseTemplates) -> TemplateRead:
    """Sparar klassens frågor (utkastet) som mall. Skoladmin skapar skolans mallar, läraren
    egna mallar."""
    school_class = get_accessible_class(db, user, body.class_id)
    questions = draft_questions(db, school_class.id)
    if not questions:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Klassen har inga frågor att spara"
        )
    template = QuestionTemplate(
        school_id=school_class.school_id,
        owner_id=None if user.role == UserRole.SCHOOL_ADMIN else user.id,
        name=body.name,
        questions=questions,
        created_by_id=user.id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template_read(template)


@router.patch("/{template_id}", response_model=TemplateRead)
def rename_template(
    template_id: UUID, body: TemplateRename, db: DbSession, user: CanUseTemplates
) -> TemplateRead:
    template = _get_editable_template(db, user, template_id)
    template.name = body.name
    db.commit()
    db.refresh(template)
    return template_read(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: UUID, db: DbSession, user: CanUseTemplates) -> Response:
    """Tar bort mallen. Klasser som har använt den behåller sina frågor."""
    template = _get_editable_template(db, user, template_id)
    db.delete(template)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class ApplyTemplate(BaseModel):
    template_id: UUID


@class_router.post("/apply-template", response_model=FormRead)
def apply_template(
    class_id: UUID, body: ApplyTemplate, db: DbSession, user: CanUseTemplates
) -> FormRead:
    """Kopierar mallens frågor till klassens utkast. Mallen ersätter utkastet.

    Frågorna får nya id:n, så att de aldrig krockar med frågor som klassen redan har
    publicerat. Läraren publicerar som vanligt när hen är klar.
    """
    school_class = get_accessible_class(db, user, class_id)
    template = get_visible_template(db, user, body.template_id)
    return replace_draft(db, school_class.id, copy_with_new_ids(template.questions), user)
