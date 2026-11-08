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
from app.models.school_class import ClassTrack, SchoolClass
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


@pytest.fixture
def admin(make_user: Callable[..., User]) -> User:
    return make_user(email="admin@skolan.se", role=UserRole.SCHOOL_ADMIN)


def test_class_created_with_program(
    client: TestClient, login: Login, admin: User, calls: list[str]
) -> None:
    login(admin)
    made = client.post(
        "/api/classes", json={"name": "EL26", "curriculum": "gy25", "program_code": "EE25"}
    )
    assert made.status_code == 201, made.text
    got = client.get(f"/api/classes/{made.json()['id']}/curriculum").json()
    assert (got["curriculum"], got["program_name"]) == ("gy25", "El- och energiprogrammet")
    # Programmet måste höra till läroplanen.
    wrong = {"name": "EL27", "curriculum": "gy11", "program_code": "EE25"}
    assert client.post("/api/classes", json=wrong).status_code == 422
    # Utan program går det också, då väljer skoladmin senare.
    assert client.post("/api/classes", json={"name": "EL28"}).status_code == 201


def test_admin_sets_program_and_tracks_teacher_picks_subjects(
    client: TestClient,
    login: Login,
    db: Session,
    admin: User,
    teacher: User,
    ee: SchoolClass,
    calls: list[str],
) -> None:
    el, aut = ClassTrack(class_id=ee.id, name="El"), ClassTrack(class_id=ee.id, name="Automation")
    db.add_all([el, aut])
    db.flush()
    base = f"/api/classes/{ee.id}"

    # Läraren väljer inte program och kan inte välja ämnen innan det finns.
    login(teacher)
    program = {"curriculum": "gy25", "program_code": "EE25"}
    assert client.put(f"{base}/program", json=program).status_code == 403
    assert client.put(f"{base}/subjects", json={"level_codes": []}).status_code == 422

    login(admin)
    assert client.put(f"{base}/program", json=program).status_code == 200
    linked = client.put(
        f"{base}/tracks/{el.id}/orientation", json={"orientation_code": "EEELK"}
    ).json()
    assert {(t["name"], t["orientation_name"]) for t in linked["tracks"]} == {
        ("El", "Elteknik"),
        ("Automation", None),
    }
    wrong = client.put(f"{base}/tracks/{aut.id}/orientation", json={"orientation_code": "EEELT"})
    assert wrong.status_code == 422  # Gy11-koden finns inte i EE25

    login(teacher)
    assert (
        client.put(f"{base}/tracks/{aut.id}/orientation", json={"orientation_code": "EEAUK"})
    ).status_code == 403
    saved = client.put(
        f"{base}/subjects", json={"level_codes": ["ELTE1000X", "INST1000X", "ELTE1000X"]}
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["subjects"][0] == {
        "subject_code": "ELTE",
        "subject_name": "Elteknik",
        "level_code": "ELTE1000X",
        "level_name": "Nivå 1",
        "points": 100,
    }
    assert client.put(f"{base}/subjects", json={"level_codes": ["ELRELK0"]}).status_code == 422

    groups = client.get(
        "/api/syllabus/programs/EE25/groups", params={"orientation": ["EEELK", "EEAUK"]}
    ).json()
    titles = [g["title"] for g in groups]
    assert titles[0] == "Alla på El- och energiprogrammet"
    assert "Inriktningen elteknik" in titles and "Inriktningen automationsteknik" in titles
    assert "Yrkesutgång: Service- och installationselektriker" in titles
    assert titles[-1] == "Programfördjupning"

    # Byter skoladmin program försvinner ämnena och kopplingarna.
    login(admin)
    changed = client.put(f"{base}/program", json={"curriculum": "gy11", "program_code": "EE"})
    body = changed.json()
    assert body["subjects"] == []
    assert all(t["orientation_code"] is None for t in body["tracks"])


def test_only_the_class_teacher_sees_it(
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
