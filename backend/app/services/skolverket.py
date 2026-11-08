"""Skolverkets Syllabus API (idé 13, Texas 2026-11-08).

https://www.skolverket.se/om-oss/oppna-data/api-for-laroplaner-kurs--och-amnesplaner-syllabus

Svaren sparas i `syllabus_cache` och hämtas igen när de är äldre än `MAX_AGE`. Svarar inte
Skolverket används det sparade svaret, hur gammalt det än är. Gy11 och Gy25 har samma
uppbyggnad: programmet har ämnen, och varje ämne har kurser (Gy11) eller nivåer (Gy25).
"""

import json
import logging
import urllib.request
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.core import time
from app.models.syllabus import SyllabusCache

log = logging.getLogger(__name__)

BASE_URL = "https://api.skolverket.se/syllabus/v1"
MAX_AGE = timedelta(days=7)
TIMEOUT_SECONDS = 15

# Gy25 har PROGRAM25, Gy11 har PROGRAM.
PATH_TYPES = {"gy25": "PROGRAM25", "gy11": "PROGRAM"}


class SkolverketUnavailable(RuntimeError):
    """Skolverket svarar inte och inget sparat svar finns."""


def _download(path: str) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{BASE_URL}{path}", headers={"Accept": "application/json", "User-Agent": "Firstflow"}
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
        return json.loads(response.read())


def _cached(db: Session, kind: str, code: str, path: str) -> dict[str, Any]:
    row = db.get(SyllabusCache, (kind, code))
    if row is not None and time.now() - row.fetched_at < MAX_AGE:
        return row.data
    try:
        data = _download(path)
    except Exception as error:  # noqa: BLE001 – nätverk, tidsgräns eller trasigt svar
        log.warning("Skolverket svarade inte på %s: %s", path, type(error).__name__)
        if row is not None:
            return row.data
        raise SkolverketUnavailable from error
    if row is None:
        db.add(SyllabusCache(kind=kind, code=code, data=data, fetched_at=time.now()))
    else:
        row.data = data
        row.fetched_at = time.now()
    db.flush()
    return data


@dataclass(frozen=True)
class Orientation:
    code: str
    name: str


@dataclass(frozen=True)
class Program:
    code: str
    name: str
    orientations: list[Orientation]


@dataclass(frozen=True)
class Level:
    """En nivå (Gy25) eller kurs (Gy11) i ett ämne."""

    subject_code: str
    subject_name: str
    level_code: str
    level_name: str
    points: int | None


@dataclass(frozen=True)
class Group:
    """En grupp ämnen i programmet, till exempel inriktningen eller en yrkesutgång."""

    kind: str  # program, orientation, outcome, specialization
    title: str
    levels: list[Level]


def programs(db: Session, curriculum: str) -> list[Program]:
    """Gymnasieskolans program för läroplanen, sorterade efter namn."""
    data = _cached(db, "programs", "", "/programs")
    found = [
        Program(
            code=p["code"],
            name=p["name"],
            orientations=[Orientation(o["code"], o["name"]) for o in p.get("orientations", [])],
        )
        for p in data.get("programs", [])
        if p.get("studyPathType") == PATH_TYPES[curriculum] and "GY" in p.get("schoolTypes", [])
    ]
    return sorted(found, key=lambda p: p.name)


def program(db: Session, code: str) -> dict[str, Any]:
    """Programmet i detalj, som Skolverket skickar det."""
    return _cached(db, "program", code, f"/programs/{code}")["program"]


def _points(value: Any) -> int | None:
    try:
        points = int(value)
    except (TypeError, ValueError):
        return None
    return points if points > 0 else None


def _levels(subjects: list[dict[str, Any]]) -> list[Level]:
    return [
        Level(
            subject_code=s["code"],
            subject_name=s["name"],
            level_code=c["code"],
            level_name=c["name"],
            points=_points(c.get("points")),
        )
        for s in subjects
        for c in s.get("courses", [])
    ]


def orientations(data: dict[str, Any]) -> dict[str, str]:
    """Programmets inriktningar, kod till namn."""
    return {o["code"]: o["name"] for o in data.get("orientations", [])}


def groups(data: dict[str, Any], orientation_codes: list[str]) -> list[Group]:
    """Programmets ämnen i den ordning läraren ser dem: först det alla läser, sedan varje
    inriktning i klassen med dess yrkesutgångar, och sist programfördjupningen."""
    result = [
        Group(
            "program",
            f"Alla på {data['name']}",
            _levels(data.get("programmeSpecificSubjects", {}).get("subjects", [])),
        )
    ]
    for o in data.get("orientations", []):
        if o["code"] not in orientation_codes:
            continue
        result.append(
            Group("orientation", f"Inriktningen {o['name'].lower()}", _levels(o["subjects"]))
        )
        for v in data.get("vocationalOutcomes", []):
            if v.get("orientationCode") == o["code"]:
                subjects = v.get("specialization", {}).get("subjects", [])
                result.append(Group("outcome", f"Yrkesutgång: {v['name']}", _levels(subjects)))
    result.append(
        Group(
            "specialization",
            "Programfördjupning",
            _levels(data.get("specialization", {}).get("subjects", [])),
        )
    )
    return [g for g in result if g.levels]


def find_levels(data: dict[str, Any], codes: list[str]) -> dict[str, Level]:
    """Nivåerna eller kurserna med de här koderna, var de än finns i programmet."""
    every = [
        *data.get("programmeSpecificSubjects", {}).get("subjects", []),
        *(s for o in data.get("orientations", []) for s in o["subjects"]),
        *(
            s
            for v in data.get("vocationalOutcomes", [])
            for s in v.get("specialization", {}).get("subjects", [])
        ),
        *data.get("specialization", {}).get("subjects", []),
    ]
    wanted = set(codes)
    return {level.level_code: level for level in _levels(every) if level.level_code in wanted}
