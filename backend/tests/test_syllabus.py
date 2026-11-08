"""Klassens läroplan och ämnen från Skolverket (idé 13, steg 1).

Svaren från Skolverket ligger i `tests/fixtures/skolverket`, hämtade 2026-11-08.
"""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any
from uuid import uuid4

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
        parts = path.strip("/").split("/")  # programs, programs/EE25 eller subjects/ELTE
        name = "programs" if len(parts) == 1 else f"{parts[0][:-1]}_{parts[1]}"
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


def test_admin_sets_teacher_program_and_teacher_creates_class(
    client: TestClient, login: Login, admin: User, teacher: User, school: School, calls: list[str]
) -> None:
    # En klass som läraren skapade innan hen hade ett program får programmet sedan.
    login(teacher)
    early = client.post("/api/classes", json={"name": "EL23"}).json()
    login(admin)
    url = f"/api/schools/{school.id}/users/{teacher.id}/program"
    assert client.put(url, json={"program_name": "Finns inte"}).status_code == 422
    got = client.put(url, json={"program_name": "El- och energiprogrammet"})
    assert got.json()["program_name"] == "El- och energiprogrammet"
    early_body = client.get(f"/api/classes/{early['id']}/curriculum").json()
    assert (early_body["curriculum"], early_body["program_code"]) == ("gy11", "EE")
    # Bara lärare har program.
    other = client.put(f"/api/schools/{school.id}/users/{admin.id}/program", json=got.json())
    assert other.status_code == 404

    # Lärarens klasser får programmet. Läroplanen gissas utifrån namnet.
    login(teacher)
    for name, curriculum, code in [("EL26", "gy25", "EE25"), ("EL24", "gy11", "EE")]:
        made = client.post("/api/classes", json={"name": name}).json()
        body = client.get(f"/api/classes/{made['id']}/curriculum").json()
        assert (body["curriculum"], body["program_code"]) == (curriculum, code)
    # Läraren kan inte välja ett annat program.
    made = client.post(
        "/api/classes", json={"name": "TE26", "curriculum": "gy25", "program_code": "TE25"}
    ).json()
    body = client.get(f"/api/classes/{made['id']}/curriculum").json()
    assert body["program_code"] == "EE25"


def test_admin_creates_class_with_any_program(
    client: TestClient, login: Login, admin: User, calls: list[str]
) -> None:
    login(admin)
    made = client.post(
        "/api/classes", json={"name": "TE26", "curriculum": "gy25", "program_code": "TE25"}
    )
    assert made.status_code == 201, made.text
    wrong = {"name": "TE27", "curriculum": "gy11", "program_code": "TE25"}
    assert client.post("/api/classes", json=wrong).status_code == 422
    assert client.post("/api/classes", json={"name": "Utan program"}).status_code == 201


def test_teacher_sets_up_own_class(
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
    teacher.program_name = "El- och energiprogrammet"
    db.flush()
    base = f"/api/classes/{ee.id}"

    login(teacher)
    assert client.put(f"{base}/subjects", json={"level_codes": []}).status_code == 422
    # Läraren väljer läroplan inom sitt program, men inte ett annat program.
    te = {"curriculum": "gy25", "program_code": "TE25"}
    assert client.put(f"{base}/program", json=te).status_code == 403
    program = {"curriculum": "gy25", "program_code": "EE25"}
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

    # Byter läraren till Gy11 försvinner ämnena och kopplingarna.
    changed = client.put(f"{base}/program", json={"curriculum": "gy11", "program_code": "EE"})
    body = changed.json()
    assert body["subjects"] == []
    assert all(t["orientation_code"] is None for t in body["tracks"])

    # Skoladmin kan byta program, även till ett annat än lärarens.
    teacher.program_name = "Teknikprogrammet"
    db.flush()
    login(admin)
    assert client.put(f"{base}/program", json=program).status_code == 200


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


ELTE_1 = (
    "Enklare elarbete, till exempel losskoppling och anslutning av apparater i befintlig "
    "gruppledning."
)
ELTE_2 = "Enkel funktionsprovning, till exempel av strömbrytare och uttag."


def test_class_goals_from_central_content(
    client: TestClient,
    login: Login,
    db: Session,
    make_user: Callable[..., User],
    teacher: User,
    ee: SchoolClass,
    calls: list[str],
) -> None:
    teacher.program_name = "El- och energiprogrammet"
    db.flush()
    base = f"/api/classes/{ee.id}"
    login(teacher)
    client.put(f"{base}/program", json={"curriculum": "gy25", "program_code": "EE25"})
    # Bara klassens ämnen har innehåll.
    assert client.get(f"{base}/subjects/ELTE1000X/content").status_code == 404
    client.put(f"{base}/subjects", json={"level_codes": ["ELTE1000X"]})

    content = client.get(f"{base}/subjects/ELTE1000X/content").json()
    assert content["title"] == "Elteknik, nivå 1"
    assert len(content["points"]) == 13
    assert content["points"][2] == {"text": ELTE_1, "goal": None}

    url = f"{base}/subjects/ELTE1000X/goals"
    two = {"goals": [{"content": ELTE_1, "name": "Ansluta"}, {"content": ELTE_2, "name": "Prova"}]}
    saved = client.put(url, json=two).json()
    goal = saved["points"][2]["goal"]
    assert goal["name"] == "Ansluta"
    assert (goal["group"], goal["curriculum"]) == ("Elteknik, nivå 1", ELTE_1)
    wrong = {"goals": [{"content": "Finns inte", "name": "X"}]}
    assert client.put(url, json=wrong).status_code == 422
    same = {"goals": [{"content": ELTE_1, "name": "A"}, {"content": ELTE_2, "name": "a"}]}
    assert client.put(url, json=same).status_code == 422

    # Klassens mål kommer först, sedan skolans. Skolans lista har inte klassens mål.
    client.post("/api/goals", json={"name": "Kundkontakt"})
    listed = client.get("/api/goals", params={"class_id": str(ee.id)}).json()
    assert [g["name"] for g in listed] == ["Ansluta", "Prova", "Kundkontakt"]
    assert [g["name"] for g in client.get("/api/goals").json()] == ["Kundkontakt"]

    # Frågorna kan använda klassens mål. En annan klass kan inte.
    question = {"id": str(uuid4()), "type": "yes_no", "title": "Anslöt du något?"}
    question["goals"] = [{"when": "yes", "goal_id": goal["id"]}]
    assert client.put(f"{base}/form", json={"questions": [question]}).status_code == 200
    other = SchoolClass(school_id=ee.school_id, name="EL26", teachers=[teacher])
    db.add(other)
    db.flush()
    used = client.put(f"/api/classes/{other.id}/form", json={"questions": [question]})
    assert used.status_code == 422

    # Ett mål som frågorna har använt kan bytas namn på men inte tas bort, inte heller när det
    # bara finns i en publicerad version.
    client.post(f"{base}/form/publish")
    client.put(f"{base}/form", json={"questions": []})
    only_prova = {"goals": [{"content": ELTE_2, "name": "Prova"}]}
    blocked = client.put(url, json=only_prova)
    assert blocked.status_code == 422
    assert blocked.json()["detail"] == "Ansluta har använts i frågorna och kan inte tas bort"
    renamed = {"goals": [{"content": ELTE_1, "name": "Ansluta apparater"}]}
    saved = client.put(url, json=renamed).json()
    assert saved["points"][2]["goal"] == {**goal, "name": "Ansluta apparater"}
    assert saved["points"][3]["goal"] is None  # Prova användes inte och togs bort

    # En annan lärare ser inte klassens innehåll.
    login(make_user(email="per@skolan.se", role=UserRole.TEACHER))
    assert client.get(f"{base}/subjects/ELTE1000X/content").status_code == 404


def test_grade_basis(
    client: TestClient,
    login: Login,
    db: Session,
    make_user: Callable[..., User],
    teacher: User,
    ee: SchoolClass,
    calls: list[str],
) -> None:
    """Idé 13, steg 8: underlaget inför betyg visar målen per ämne och betygskriterierna."""
    hugo = make_user(email="hugo@skolan.se", role=UserRole.STUDENT)
    ee.students.append(hugo)
    teacher.program_name = "El- och energiprogrammet"
    db.flush()
    base = f"/api/classes/{ee.id}"
    login(teacher)
    client.put(f"{base}/program", json={"curriculum": "gy25", "program_code": "EE25"})
    client.put(f"{base}/subjects", json={"level_codes": ["ELTE1000X"]})
    goals = {
        "goals": [{"content": ELTE_1, "name": "Ansluta"}, {"content": ELTE_2, "name": "Prova"}]
    }
    client.put(f"{base}/subjects/ELTE1000X/goals", json=goals)

    basis = client.get(f"/api/students/{hugo.id}/grade-basis")
    assert basis.status_code == 200, basis.text
    body = basis.json()
    assert (body["class_name"], body["other_goals"], body["comments"]) == ("EL25", [], [])
    (subject,) = body["subjects"]
    assert subject["title"] == "Elteknik, nivå 1"
    assert [g["goal"]["name"] for g in subject["goals"]] == ["Ansluta", "Prova"]
    assert [c["grade"] for c in subject["criteria"]] == ["E", "C", "A"]
    drawings = subject["criteria"][0]["paragraphs"][2]
    assert {"text": "viss säkerhet", "bold": True} in drawings

    login(make_user(email="per@skolan.se", role=UserRole.TEACHER))
    assert client.get(f"/api/students/{hugo.id}/grade-basis").status_code == 404
