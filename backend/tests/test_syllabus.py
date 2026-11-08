"""Klassens läroplan och ämnen från Skolverket (idé 13, steg 1).

Svaren från Skolverket ligger i `tests/fixtures/skolverket`, hämtade 2026-11-08.
"""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.routes.syllabus import suggested_curriculum
from app.models.school import School
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole
from app.services import skolverket

FIXTURES = Path(__file__).parent / "fixtures" / "skolverket"
Login = Callable[[User], None]


@pytest.fixture
def calls(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Skolverket svarar med de sparade filerna. Listan visar vilka anrop som gjordes."""
    made: list[str] = []

    def download(path: str) -> dict[str, Any]:
        made.append(path)
        name = "programs" if path == "/programs" else "program_" + path.rsplit("/", 1)[1]
        return json.loads((FIXTURES / f"{name}.json").read_text())

    monkeypatch.setattr(skolverket, "_download", download)
    return made


@pytest.fixture
def ee(db: Session, school: School) -> SchoolClass:
    school_class = SchoolClass(school_id=school.id, name="EL25")
    db.add(school_class)
    db.flush()
    return school_class


@pytest.fixture
def teacher(db: Session, make_user: Callable[..., User], ee: SchoolClass) -> User:
    user = make_user(email="ingrid@skolan.se", role=UserRole.TEACHER)
    ee.teachers.append(user)
    db.flush()
    return user


def test_suggested_curriculum_from_class_name() -> None:
    assert suggested_curriculum("EE23") == "gy11"
    assert suggested_curriculum("EL25") == "gy25"
    assert suggested_curriculum("TE26b") == "gy25"
    assert suggested_curriculum("Elektrikerna") == "gy25"


def test_programs_per_curriculum(
    client: TestClient, login: Login, teacher: User, calls: list[str]
) -> None:
    login(teacher)
    gy25 = client.get("/api/syllabus/programs", params={"curriculum": "gy25"}).json()
    ee25 = next(p for p in gy25 if p["name"] == "El- och energiprogrammet")
    assert ee25["code"] == "EE25"
    assert {"code": "EEELK", "name": "Elteknik"} in ee25["orientations"]
    gy11 = client.get("/api/syllabus/programs", params={"curriculum": "gy11"}).json()
    assert "EE" in {p["code"] for p in gy11}
    assert "EE25" not in {p["code"] for p in gy11}
    # Andra gången används det sparade svaret.
    assert calls == ["/programs"]


def test_class_chooses_subjects(
    client: TestClient, login: Login, teacher: User, ee: SchoolClass, calls: list[str]
) -> None:
    login(teacher)
    url = f"/api/classes/{ee.id}/curriculum"
    empty = client.get(url).json()
    assert empty["curriculum"] is None
    assert empty["suggested_curriculum"] == "gy25"
    assert empty["subjects"] == []

    saved = client.put(
        url,
        json={
            "curriculum": "gy25",
            "program_code": "EE25",
            "orientation_code": "EEELK",
            "level_codes": ["ELTE1000X", "INST1000X", "INST2000X", "ELTE1000X"],
        },
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["program_name"] == "El- och energiprogrammet"
    assert [s["level_code"] for s in body["subjects"]] == ["ELTE1000X", "INST1000X", "INST2000X"]
    assert body["subjects"][0] == {
        "subject_code": "ELTE",
        "subject_name": "Elteknik",
        "level_code": "ELTE1000X",
        "level_name": "Nivå 1",
        "points": 100,
    }

    groups = client.get(
        "/api/syllabus/programs/EE25/groups", params={"orientation": "EEELK"}
    ).json()
    kinds = [g["kind"] for g in groups]
    assert kinds[:2] == ["program", "orientation"]
    assert "outcome" in kinds and kinds[-1] == "specialization"
    assert groups[0]["title"] == "Alla på El- och energiprogrammet"
    assert groups[1]["title"] == "Inriktningen elteknik"
    assert "KOMM1000X" in {lv["level_code"] for lv in groups[1]["levels"]}


def test_gy11_courses_and_validation(
    client: TestClient, login: Login, teacher: User, ee: SchoolClass, calls: list[str]
) -> None:
    login(teacher)
    url = f"/api/classes/{ee.id}/curriculum"
    body = {"curriculum": "gy11", "program_code": "EE", "orientation_code": "EEELT"}
    saved = client.put(url, json={**body, "level_codes": ["ELRELK0", "INSELI0"]}).json()
    assert [(s["subject_name"], s["level_name"]) for s in saved["subjects"]] == [
        ("Elektroteknik", "Elektromekanik"),
        ("Installationsteknik", "Elinstallationer"),
    ]
    # Programmet måste höra till läroplanen, och ämnena till programmet.
    wrong = {**body, "curriculum": "gy25", "level_codes": []}
    assert client.put(url, json=wrong).status_code == 422
    assert client.put(url, json={**body, "level_codes": ["ELTE1000X"]}).status_code == 422
    bad = {**body, "orientation_code": "EEELK", "level_codes": []}
    assert client.put(url, json=bad).status_code == 422


def test_only_the_class_teacher_changes_it(
    client: TestClient,
    login: Login,
    make_user: Callable[..., User],
    ee: SchoolClass,
    calls: list[str],
) -> None:
    other = make_user(email="per@skolan.se", role=UserRole.TEACHER)
    login(other)
    assert client.get(f"/api/classes/{ee.id}/curriculum").status_code == 404
    student = make_user(email="hugo@skolan.se", role=UserRole.STUDENT)
    login(student)
    assert client.get("/api/syllabus/programs", params={"curriculum": "gy25"}).status_code == 403


def test_skolverket_down(
    client: TestClient, login: Login, teacher: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    def down(path: str) -> dict[str, Any]:
        raise OSError("nere")

    monkeypatch.setattr(skolverket, "_download", down)
    login(teacher)
    response = client.get("/api/syllabus/programs", params={"curriculum": "gy25"})
    assert response.status_code == 503
    assert "Skolverket" in response.json()["detail"]
