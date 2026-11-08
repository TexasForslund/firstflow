"""Klassens läroplan och ämnen (idé 13, steg 1, Texas 2026-11-08).

Läraren väljer läroplan (Gy25 eller Gy11), program och inriktning. Firstflow föreslår ämnena
utifrån Skolverket, och läraren kryssar i de ämnen och nivåer eller kurser som eleverna tränar
under APL. Målförslagen i steg 2 kommer från de valda ämnenas centrala innehåll.
"""

import re
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import delete, select

from app.api.deps import require_roles
from app.api.routes.classes import CanEditClasses, CanViewClasses, get_accessible_class
from app.db.session import DbSession
from app.models.school_class import SchoolClass
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


@router.get("/syllabus/programs/{program_code}/groups", response_model=list[GroupRead])
def program_groups(
    program_code: str, db: DbSession, user: Staff, orientation: str | None = None
) -> list[GroupRead]:
    """Programmets ämnen att välja bland: först det alla läser, sedan inriktningen, dess
    yrkesutgångar och sist programfördjupningen."""
    try:
        data = skolverket.program(db, program_code)
    except skolverket.SkolverketUnavailable:
        raise _unavailable() from None
    db.commit()
    return [
        GroupRead(kind=g.kind, title=g.title, levels=[_level(lv) for lv in g.levels])
        for g in skolverket.groups(data, orientation)
    ]


class ClassCurriculum(BaseModel):
    curriculum: Curriculum | None
    suggested_curriculum: Curriculum = Field(
        description="Gissad utifrån året i klassens namn: 25 eller senare blir Gy25"
    )
    program_code: str | None
    program_name: str | None
    orientation_code: str | None
    subjects: list[LevelRead] = Field(description="Klassens valda ämnen")


class ClassCurriculumWrite(BaseModel):
    curriculum: Curriculum
    program_code: str = Field(min_length=1, max_length=10)
    orientation_code: str | None = Field(default=None, max_length=10)
    level_codes: list[str] = Field(max_length=60)

    @model_validator(mode="after")
    def unique_levels(self) -> "ClassCurriculumWrite":
        self.level_codes = list(dict.fromkeys(self.level_codes))
        return self


def suggested_curriculum(name: str) -> Curriculum:
    """Klasser heter ofta efter startåret, till exempel EE23. Startår 2025 eller senare läser
    Gy25. Utan år i namnet gissar vi Gy25."""
    years = re.findall(r"(?<!\d)(\d{2})(?!\d)", name)
    if not years:
        return "gy25"
    return "gy25" if int(years[-1]) >= 25 else "gy11"


def _level(row: ClassSubject | skolverket.Level) -> LevelRead:
    return LevelRead(
        subject_code=row.subject_code,
        subject_name=row.subject_name,
        level_code=row.level_code,
        level_name=row.level_name,
        points=row.points,
    )


def _read(db: DbSession, school_class: SchoolClass) -> ClassCurriculum:
    chosen = db.scalars(
        select(ClassSubject)
        .where(ClassSubject.class_id == school_class.id)
        .order_by(ClassSubject.subject_name, ClassSubject.level_code)
    ).all()
    program_name = None
    if school_class.program_code:
        try:
            program_name = skolverket.program(db, school_class.program_code)["name"]
        except skolverket.SkolverketUnavailable:
            raise _unavailable() from None
    return ClassCurriculum(
        curriculum=school_class.curriculum,
        suggested_curriculum=suggested_curriculum(school_class.name),
        program_code=school_class.program_code,
        program_name=program_name,
        orientation_code=school_class.orientation_code,
        subjects=[_level(row) for row in chosen],
    )


@router.get("/classes/{class_id}/curriculum", response_model=ClassCurriculum)
def get_class_curriculum(class_id: UUID, db: DbSession, user: CanViewClasses) -> ClassCurriculum:
    """Klassens läroplan, program, inriktning och ämnen, och programmets ämnen att välja bland."""
    school_class = get_accessible_class(db, user, class_id)
    result = _read(db, school_class)
    db.commit()
    return result


@router.put("/classes/{class_id}/curriculum", response_model=ClassCurriculum)
def set_class_curriculum(
    class_id: UUID, body: ClassCurriculumWrite, db: DbSession, user: CanEditClasses
) -> ClassCurriculum:
    """Sparar klassens läroplan, program, inriktning och ämnen. Ämnena skrivs över."""
    school_class = get_accessible_class(db, user, class_id)
    if body.program_code not in {p.code for p in _programs(db, body.curriculum)}:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Programmet finns inte i läroplanen"
        )
    try:
        data = skolverket.program(db, body.program_code)
    except skolverket.SkolverketUnavailable:
        raise _unavailable() from None
    orientations = {o["code"] for o in data.get("orientations", [])}
    if body.orientation_code is not None and body.orientation_code not in orientations:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Inriktningen finns inte i programmet"
        )
    levels = skolverket.find_levels(data, body.level_codes)
    if len(levels) != len(body.level_codes):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Ett ämne finns inte i programmet"
        )
    school_class.curriculum = body.curriculum
    school_class.program_code = body.program_code
    school_class.orientation_code = body.orientation_code
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


def _programs(db: DbSession, curriculum: Curriculum) -> list[skolverket.Program]:
    try:
        return skolverket.programs(db, curriculum)
    except skolverket.SkolverketUnavailable:
        raise _unavailable() from None
