"""Import av elever och personal för skoladmin (B20, Texas 2026-11-02).

Skoladmin laddar upp en fil (CSV eller Excel) enligt mallen, väljer klasserna som har APL,
ser en förhandsvisning och importerar. Filen skickas med båda gångerna, så att inget sparas
förrän skoladmin importerar. Se `app/services/user_import.py`.
"""

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import require_roles
from app.api.routes.invitations import invite_accounts
from app.db.session import DbSession
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole
from app.services import user_import
from app.services.user_import import ImportFileError

router = APIRouter(prefix="/import", tags=["import"])
logger = logging.getLogger(__name__)

SchoolAdmin = Annotated[User, Depends(require_roles(UserRole.SCHOOL_ADMIN))]
ImportFile = Annotated[UploadFile, File(description="CSV eller Excel (.xlsx) enligt mallen")]
Classes = Annotated[
    list[str] | None,
    Form(description="Klasserna som har APL. Utan klasser visas bara filens klasser"),
]


class FileClass(BaseModel):
    name: str
    students: int
    teachers: int
    exists: bool = Field(description="Klassen finns redan i Firstflow")


class ImportPerson(BaseModel):
    name: str
    email: str
    role: str = Field(description="Elev, Lärare, SYV eller Rektor")
    class_name: str | None
    what: str = Field(default="", description="Vad som ändras")


class RowErrorRead(BaseModel):
    row: int
    message: str


class ClassPlanRead(BaseModel):
    name: str
    exists: bool
    new_students: int
    changed: int
    leaving: int
    teachers: list[str]


class ImportPreview(BaseModel):
    file_classes: list[FileClass]
    selected: list[str]
    new: list[ImportPerson]
    changed: list[ImportPerson]
    leaving: list[ImportPerson]
    errors: list[RowErrorRead]
    classes: list[ClassPlanRead]
    skipped: int = Field(description="Rader i klasser som inte är valda")


class ImportResult(BaseModel):
    created: int
    changed: int
    left: int
    invited: int
    errors: int


def _person(p: user_import.Person) -> ImportPerson:
    return ImportPerson(
        name=p.name,
        email=p.email,
        role=user_import.role_label(p.role),
        class_name=p.class_name,
        what=p.what,
    )


def _plan(db: DbSession, user: User, file: UploadFile, classes: list[str]) -> user_import.Plan:
    assert user.school_id is not None
    data = file.file.read(user_import.MAX_FILE_BYTES + 1)
    try:
        rows, errors = user_import.read_rows(data, file.filename or "")
    except ImportFileError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    return user_import.plan(db, user.school_id, rows, errors, classes)


def _preview(db: DbSession, user: User, result: user_import.Plan) -> ImportPreview:
    existing = set(
        db.scalars(
            select(SchoolClass.name).where(
                SchoolClass.school_id == user.school_id,
                SchoolClass.name.in_(list(result.file_classes)),
            )
        )
    )
    return ImportPreview(
        file_classes=[
            FileClass(name=name, students=s, teachers=t, exists=name in existing)
            for name, (s, t) in sorted(result.file_classes.items())
        ],
        selected=result.selected,
        new=[_person(p) for p in result.new],
        changed=[_person(p) for p in result.changed],
        leaving=[_person(p) for p in result.leaving],
        errors=[RowErrorRead(row=e.number, message=e.message) for e in result.errors],
        classes=[
            ClassPlanRead(
                name=c.name,
                exists=c.exists,
                new_students=c.new_students,
                changed=c.changed,
                leaving=c.leaving,
                teachers=c.teachers,
            )
            for c in result.classes
        ],
        skipped=result.skipped,
    )


@router.get(
    "/template",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}, "application/vnd.ms-excel": {}}}},
)
def template(_user: SchoolAdmin, format: Literal["csv", "xlsx"] = "xlsx") -> Response:
    """Mallen med kolumnerna och tre exempelrader."""
    if format == "csv":
        content, media, name = user_import.template_csv(), "text/csv", "firstflow-mall.csv"
    else:
        content = user_import.template_xlsx()
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        name = "firstflow-mall.xlsx"
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.post("/preview", response_model=ImportPreview)
def preview(
    file: ImportFile, db: DbSession, user: SchoolAdmin, classes: Classes = None
) -> ImportPreview:
    """Vad som händer om filen importeras med de valda klasserna. Inget sparas."""
    return _preview(db, user, _plan(db, user, file, classes or []))


@router.post("/run", response_model=ImportResult)
def run(
    file: ImportFile,
    db: DbSession,
    user: SchoolAdmin,
    classes: Classes = None,
    send_invites: Annotated[bool, Form()] = True,
) -> ImportResult:
    """Importerar filen med de valda klasserna. Rader med fel hoppas över."""
    result = _plan(db, user, file, classes or [])
    if not result.selected:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Välj minst en klass med APL"
        )
    assert user.school_id is not None
    to_invite = user_import.apply(db, user.school_id, result)
    db.commit()
    invited = invite_accounts(db, user, to_invite) if send_invites else 0
    # Bara antal i loggen, aldrig namn eller e-post.
    logger.info(
        "Import på skola %s: %d nya, %d ändrade, %d lämnade, %d inbjudna, %d fel",
        user.school_id,
        len(result.new),
        len(result.changed),
        len(result.leaving),
        invited,
        len(result.errors),
    )
    return ImportResult(
        created=len(result.new),
        changed=len(result.changed),
        left=len(result.leaving),
        invited=invited,
        errors=len(result.errors),
    )
