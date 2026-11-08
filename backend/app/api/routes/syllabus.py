"""Klassens läroplan och ämnen (idé 13, steg 1, Texas 2026-11-08).

- Skoladmin kopplar varje lärare till ett program. Lärarens nya klasser får programmet, och
  läroplanen (Gy25 eller Gy11) gissas utifrån året i klassens namn.
- Läraren ändrar sina egna klasser: läroplan inom samma program, inriktningar och ämnen. Bara
  skoladmin byter klassens program.
- Inriktningen hör till eleven. Klassens inriktningar kopplas till Skolverkets.
- Läraren kryssar i de ämnen och nivåer eller kurser som eleverna tränar under APL, bland
  förslag för programmet och klassens inriktningar. Målförslagen i steg 2 kommer därifrån.
"""

import re
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import delete, select, update

from app.api.deps import require_roles
from app.api.routes.classes import CanEditClasses, CanViewClasses, get_accessible_class
from app.db.session import DbSession
from app.models.school_class import ClassTrack, SchoolClass
from app.models.syllabus import ClassSubject
from app.models.user import User, UserRole
from app.services import skolverket

router = APIRouter(tags=["syllabus"])

Curriculum = Literal["gy25", "gy11"]
Staff = Annotated[
    User,
    Depends(require_roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PRINCIPAL)),
]


def _unavailable() -> HTTPException:
    return HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Skolverket svarar inte just nu. Försök igen om en stund.",
    )


def _invalid(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail)


def _program_data(db: DbSession, code: str) -> dict:
    try:
        return skolverket.program(db, code)
    except skolverket.SkolverketUnavailable:
        raise _unavailable() from None


def check_program(db: DbSession, curriculum: str, program_code: str) -> None:
    """422 om programmet inte finns i läroplanen."""
    try:
        found = skolverket.programs(db, curriculum)
    except skolverket.SkolverketUnavailable:
        raise _unavailable() from None
    if program_code not in {p.code for p in found}:
        raise _invalid("Programmet finns inte i läroplanen")


def _program_name(db: DbSession, curriculum: str, code: str) -> str | None:
    """Programmets namn utifrån läroplanen och koden, ur listan över program."""
    try:
        found = skolverket.programs(db, curriculum)
    except skolverket.SkolverketUnavailable:
        raise _unavailable() from None
    return next((p.name for p in found if p.code == code), None)


def suggested_curriculum(name: str) -> Curriculum:
    """Klasser heter ofta efter startåret, till exempel EE23. Startår 2025 eller senare läser
    Gy25. Utan år i namnet gissar vi Gy25. Används som förslag när klassen skapas."""
    years = re.findall(r"(?<!\d)(\d{2})(?!\d)", name)
    if not years:
        return "gy25"
    return "gy25" if int(years[-1]) >= 25 else "gy11"


class OrientationRead(BaseModel):
    code: str
    name: str


class ProgramRead(BaseModel):
    code: str
    name: str
    orientations: list[OrientationRead]


@router.get("/syllabus/programs", response_model=list[ProgramRead])
def list_programs(curriculum: Curriculum, db: DbSession, user: Staff) -> list[ProgramRead]:
    """Gymnasieskolans program i läroplanen, med inriktningar, från Skolverket."""
    try:
        found = skolverket.programs(db, curriculum)
    except skolverket.SkolverketUnavailable:
        raise _unavailable() from None
    db.commit()
    return [
        ProgramRead(
            code=p.code,
            name=p.name,
            orientations=[OrientationRead(code=o.code, name=o.name) for o in p.orientations],
        )
        for p in found
    ]


class LevelRead(BaseModel):
    subject_code: str
    subject_name: str
    level_code: str
    level_name: str = Field(description='"Nivå 1" (Gy25) eller kursens namn (Gy11)')
    points: int | None


class GroupRead(BaseModel):
    kind: Literal["program", "orientation", "outcome", "specialization"]
    title: str
    levels: list[LevelRead]


def _level(row: ClassSubject | skolverket.Level) -> LevelRead:
    return LevelRead(
        subject_code=row.subject_code,
        subject_name=row.subject_name,
        level_code=row.level_code,
        level_name=row.level_name,
        points=row.points,
    )


@router.get("/syllabus/programs/{program_code}/groups", response_model=list[GroupRead])
def program_groups(
    program_code: str,
    db: DbSession,
    user: Staff,
    orientation: Annotated[list[str], Query()] = [],  # noqa: B006
) -> list[GroupRead]:
    """Programmets ämnen att välja bland: först det alla läser, sedan inriktningarna med deras
    yrkesutgångar och sist programfördjupningen."""
    data = _program_data(db, program_code)
    db.commit()
    return [
        GroupRead(kind=g.kind, title=g.title, levels=[_level(lv) for lv in g.levels])
        for g in skolverket.groups(data, orientation)
    ]


class TrackOrientation(BaseModel):
    id: UUID
    name: str
    orientation_code: str | None
    orientation_name: str | None


class ClassCurriculum(BaseModel):
    curriculum: Curriculum | None
    program_code: str | None
    program_name: str | None
    tracks: list[TrackOrientation] = Field(description="Klassens inriktningar")
    subjects: list[LevelRead] = Field(description="Klassens valda ämnen")


def _read(db: DbSession, school_class: SchoolClass) -> ClassCurriculum:
    program_name = None
    names: dict[str, str] = {}
    if school_class.program_code:
        data = _program_data(db, school_class.program_code)
        program_name = data["name"]
        names = skolverket.orientations(data)
    tracks = db.scalars(
        select(ClassTrack).where(ClassTrack.class_id == school_class.id).order_by(ClassTrack.name)
    ).all()
    chosen = db.scalars(
        select(ClassSubject)
        .where(ClassSubject.class_id == school_class.id)
        .order_by(ClassSubject.subject_name, ClassSubject.level_code)
    ).all()
    return ClassCurriculum(
        curriculum=school_class.curriculum,
        program_code=school_class.program_code,
        program_name=program_name,
        tracks=[
            TrackOrientation(
                id=t.id,
                name=t.name,
                orientation_code=t.orientation_code,
                orientation_name=names.get(t.orientation_code or ""),
            )
            for t in tracks
        ],
        subjects=[_level(row) for row in chosen],
    )


@router.get("/classes/{class_id}/curriculum", response_model=ClassCurriculum)
def get_class_curriculum(class_id: UUID, db: DbSession, user: CanViewClasses) -> ClassCurriculum:
    """Klassens läroplan, program, inriktningar och valda ämnen."""
    result = _read(db, get_accessible_class(db, user, class_id))
    db.commit()
    return result


class ProgramWrite(BaseModel):
    curriculum: Curriculum
    program_code: str = Field(min_length=1, max_length=10)


@router.put("/classes/{class_id}/program", response_model=ClassCurriculum)
def set_class_program(
    class_id: UUID, body: ProgramWrite, db: DbSession, user: CanEditClasses
) -> ClassCurriculum:
    """Ändrar klassens läroplan och program. Läraren byter bara läroplan inom samma program,
    till exempel EE (Gy11) och EE25 (Gy25). Skoladmin kan byta program. Byts koden tas
    klassens ämnen och inriktningarnas koppling bort, eftersom de hörde till den gamla."""
    school_class = get_accessible_class(db, user, class_id)
    check_program(db, body.curriculum, body.program_code)
    if user.role == UserRole.TEACHER:
        current = (
            _program_name(db, school_class.curriculum, school_class.program_code)
            if school_class.curriculum and school_class.program_code
            else user.program_name
        )
        if _program_name(db, body.curriculum, body.program_code) != current:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, detail="Bara skoladministratören byter program"
            )
    if body.program_code != school_class.program_code:
        db.execute(delete(ClassSubject).where(ClassSubject.class_id == school_class.id))
        db.execute(
            update(ClassTrack)
            .where(ClassTrack.class_id == school_class.id)
            .values(orientation_code=None)
        )
    school_class.curriculum = body.curriculum
    school_class.program_code = body.program_code
    db.flush()
    result = _read(db, school_class)
    db.commit()
    return result


class OrientationWrite(BaseModel):
    orientation_code: str | None = Field(max_length=10, description="null = ingen koppling")


@router.put("/classes/{class_id}/tracks/{track_id}/orientation", response_model=ClassCurriculum)
def set_track_orientation(
    class_id: UUID,
    track_id: UUID,
    body: OrientationWrite,
    db: DbSession,
    user: CanEditClasses,
) -> ClassCurriculum:
    """Kopplar en av klassens inriktningar till Skolverkets inriktning. Klassens lärare eller
    skoladmin."""
    school_class = get_accessible_class(db, user, class_id)
    track = db.get(ClassTrack, track_id)
    if track is None or track.class_id != school_class.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")
    if body.orientation_code is not None:
        if not school_class.program_code:
            raise _invalid("Välj program för klassen först")
        data = _program_data(db, school_class.program_code)
        if body.orientation_code not in skolverket.orientations(data):
            raise _invalid("Inriktningen finns inte i programmet")
    track.orientation_code = body.orientation_code
    db.flush()
    result = _read(db, school_class)
    db.commit()
    return result


class SubjectsWrite(BaseModel):
    level_codes: list[str] = Field(max_length=60)

    @model_validator(mode="after")
    def unique_levels(self) -> "SubjectsWrite":
        self.level_codes = list(dict.fromkeys(self.level_codes))
        return self


@router.put("/classes/{class_id}/subjects", response_model=ClassCurriculum)
def set_class_subjects(
    class_id: UUID, body: SubjectsWrite, db: DbSession, user: CanEditClasses
) -> ClassCurriculum:
    """Läraren väljer de ämnen och nivåer eller kurser som eleverna tränar under APL."""
    school_class = get_accessible_class(db, user, class_id)
    if not school_class.program_code:
        raise _invalid("Skoladministratören har inte valt program för klassen än")
    data = _program_data(db, school_class.program_code)
    levels = skolverket.find_levels(data, body.level_codes)
    if len(levels) != len(body.level_codes):
        raise _invalid("Ett ämne finns inte i programmet")
    db.execute(delete(ClassSubject).where(ClassSubject.class_id == school_class.id))
    db.add_all(
        ClassSubject(
            class_id=school_class.id,
            level_code=lv.level_code,
            subject_code=lv.subject_code,
            subject_name=lv.subject_name,
            level_name=lv.level_name,
            points=lv.points,
        )
        for lv in (levels[code] for code in body.level_codes)
    )
    db.flush()
    result = _read(db, school_class)
    db.commit()
    return result
