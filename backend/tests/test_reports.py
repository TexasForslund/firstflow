"""Veckoredovisningar: eleven svarar steg för steg, läraren läser och kommenterar."""

from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime
from typing import Any
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.report import FormVersion
from app.models.school import School
from app.models.school_class import SchoolClass, class_students
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]

TODAY = date(2026, 10, 21)  # onsdag
TUESDAY = date(2026, 10, 20)
FRIDAY = date(2026, 10, 16)
NOW = datetime(2026, 10, 21, 10, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def frozen_time() -> Iterator[None]:
    with (
        patch("app.core.time.today", return_value=TODAY),
        patch("app.core.time.now", return_value=NOW),
    ):
        yield


def q(kind: str, title: str, **extra: Any) -> dict[str, Any]:
    return {"id": str(uuid4()), "type": kind, "title": title, **extra}


class World:
    def __init__(self, db: Session, make_school: Callable[..., School], make_user: MakeUser):
        self.kramfors, umea = make_school("Kramforsskolan"), make_school("Umeåskolan")
        self.teacher = make_user(email="ingrid@kramfors.se", in_school=self.kramfors)
        self.other_teacher = make_user(email="per@kramfors.se", in_school=self.kramfors)
        self.admin = make_user(
            email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=self.kramfors
        )
        self.principal = make_user(
            email="rektor@kramfors.se", role=UserRole.PRINCIPAL, in_school=self.kramfors
        )
        self.student = make_user(
            email="hugo@kramfors.se", role=UserRole.STUDENT, in_school=self.kramfors
        )
        self.other_student = make_user(
            email="sara@kramfors.se", role=UserRole.STUDENT, in_school=self.kramfors
        )
        self.umea_student = make_user(email="ali@umea.se", role=UserRole.STUDENT, in_school=umea)
        # En elev går i en klass, så TE21 har en egen elev.
        self.te21_student = make_user(
            email="maja@kramfors.se", role=UserRole.STUDENT, in_school=self.kramfors
        )
        self.ee22 = SchoolClass(
            school_id=self.kramfors.id,
            name="EE22",
            teachers=[self.teacher],
            students=[self.student, self.other_student],
            report_due_weekdays=[1, 4],  # tisdag och fredag
        )
        self.empty = SchoolClass(
            school_id=self.kramfors.id,
            name="TE21",
            teachers=[self.teacher],
            students=[self.te21_student],
            report_due_weekdays=[1],
        )
        db.add_all([self.ee22, self.empty])
        db.flush()

        # Frågorna: Nej på första frågan hoppar till slutet.
        self.summary = q("long_text", "Vad har du gjort?")
        self.extra = q("short_text", "Något mer?", required=False)
        self.html = q("yes_no", "Har du jobbat med HTML?", logic=[{"when": "no", "goto": None}])
        self.what = q(
            "choice",
            "Vad gjorde du?",
            choices=[{"id": str(uuid4()), "label": "Layout"}, {"id": str(uuid4()), "label": "Kod"}],
            allow_other=True,
        )
        self.difficulty = q("rating", "Hur svårt var det?")
        self.info = q("statement", "Kom ihåg skyddsglasögon")
        self.questions = [
            self.html,
            self.what,
            self.difficulty,
            self.summary,
            self.extra,
            self.info,
        ]


@pytest.fixture
def w(
    client: TestClient,
    db: Session,
    make_school: Callable[..., School],
    make_user: MakeUser,
    login: Login,
) -> World:
    world = World(db, make_school, make_user)
    login(world.teacher)
    url = f"/api/classes/{world.ee22.id}/form"
    assert client.put(url, json={"questions": world.questions}).status_code == 200
    assert client.post(f"{url}/publish").status_code == 200
    client.post("/api/auth/logout")
    # Klassen fick frågor och eleverna kom in i klassen långt innan testets "i dag".
    long_ago = datetime(2026, 8, 1, tzinfo=UTC)
    db.execute(update(FormVersion).values(published_at=long_ago))
    db.execute(update(class_students).values(created_at=long_ago))
    db.flush()
    return world


def start(client: TestClient, w: World, day: date = TUESDAY) -> dict[str, Any]:
    response = client.post("/api/reports", json={"class_id": str(w.ee22.id), "due_date": str(day)})
    assert response.status_code == 200, response.text
    return response.json()


def answer(client: TestClient, report: dict, question: dict, **value: Any):
    return client.put(f"/api/reports/{report['id']}/answers/{question['id']}", json=value)


def fill_all(client: TestClient, w: World, report: dict) -> dict[str, Any]:
    answer(client, report, w.html, boolean=True)
    answer(client, report, w.what, choice_ids=[w.what["choices"][0]["id"]])
    answer(client, report, w.difficulty, rating=3)
    return answer(client, report, w.summary, text="Byggde en meny").json()


def submitted(client: TestClient, login: Login, w: World) -> dict[str, Any]:
    login(w.student)
    report = start(client, w)
    fill_all(client, w, report)
    response = client.post(f"/api/reports/{report['id']}/submit")
    assert response.status_code == 200, response.text
    client.post("/api/auth/logout")
    return response.json()


# --- Eleven -------------------------------------------------------------------------------


def test_mine_lists_due_days_of_published_classes(
    client: TestClient, login: Login, w: World
) -> None:
    login(w.student)
    items = client.get("/api/reports/mine").json()
    # Fyra veckor bakåt, tisdagar och fredagar.
    assert len(items) == 8
    assert {i["class_name"] for i in items} == {"EE22"}
    assert items[0] == {
        "class_id": str(w.ee22.id),
        "class_name": "EE22",
        "due_date": str(TUESDAY),
        "report_id": None,
        "status": "not_started",
        "is_late": True,
    }
    assert items[1]["due_date"] == str(FRIDAY)

    report = start(client, w)
    first = client.get("/api/reports/mine").json()[0]
    assert first["report_id"] == report["id"]
    assert first["status"] == "draft"


def test_start_report_is_idempotent(client: TestClient, login: Login, w: World) -> None:
    login(w.student)
    report = start(client, w)
    assert report["status"] == "draft"
    assert report["form_version"] == 1
    assert report["path"] == [
        w.html["id"],
        w.what["id"],
        w.difficulty["id"],
        w.summary["id"],
        w.extra["id"],
        w.info["id"],
    ]
    assert report["is_read"] is None
    assert start(client, w)["id"] == report["id"]


@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (date(2026, 10, 27), 422),  # framtiden
        (date(2026, 10, 21), 422),  # onsdag, ingen redovisningsdag
        (date(2026, 9, 22), 422),  # mer än fyra veckor sedan
        (date(2026, 9, 25), 200),  # fredag inom fyra veckor
    ],
)
def test_start_report_checks_the_day(
    client: TestClient, login: Login, w: World, day: date, expected: int
) -> None:
    login(w.student)
    response = client.post("/api/reports", json={"class_id": str(w.ee22.id), "due_date": str(day)})
    assert response.status_code == expected


def test_start_report_needs_published_form(client: TestClient, login: Login, w: World) -> None:
    login(w.te21_student)
    response = client.post(
        "/api/reports", json={"class_id": str(w.empty.id), "due_date": str(TUESDAY)}
    )
    assert response.status_code == 409


def test_student_outside_class_gets_404(client: TestClient, login: Login, w: World) -> None:
    for student in (w.umea_student,):
        login(student)
        response = client.post(
            "/api/reports", json={"class_id": str(w.ee22.id), "due_date": str(TUESDAY)}
        )
        assert response.status_code == 404


def test_logic_shortens_the_path(client: TestClient, login: Login, w: World) -> None:
    login(w.student)
    report = start(client, w)
    detail = answer(client, report, w.html, boolean=False).json()
    assert detail["path"] == [w.html["id"]]
    # Nej hoppar till slutet, så inget annat är obligatoriskt.
    done = client.post(f"/api/reports/{report['id']}/submit")
    assert done.status_code == 200
    assert done.json()["status"] == "submitted"


def test_skipped_answers_are_removed_on_submit(client: TestClient, login: Login, w: World) -> None:
    login(w.student)
    report = start(client, w)
    fill_all(client, w, report)
    # Eleven går tillbaka och ändrar till Nej. Svaren efter hoppet ska inte lämnas in.
    answer(client, report, w.html, boolean=False)
    done = client.post(f"/api/reports/{report['id']}/submit").json()
    assert [a["question_id"] for a in done["answers"]] == [w.html["id"]]


def test_submit_requires_required_questions(client: TestClient, login: Login, w: World) -> None:
    login(w.student)
    report = start(client, w)
    answer(client, report, w.html, boolean=True)
    response = client.post(f"/api/reports/{report['id']}/submit")
    assert response.status_code == 422
    assert "Vad gjorde du?" in response.json()["detail"]


def test_submitted_report_is_locked(client: TestClient, login: Login, w: World) -> None:
    report = submitted(client, login, w)
    assert report["submitted_at"] is not None
    assert report["is_late"] is True  # tisdagens redovisning lämnad på onsdag
    login(w.student)
    assert answer(client, report, w.summary, text="Ändrat").status_code == 409
    assert client.post(f"/api/reports/{report['id']}/submit").status_code == 409


def test_answers_are_stored_as_typed_values(client: TestClient, login: Login, w: World) -> None:
    login(w.student)
    report = start(client, w)
    detail = fill_all(client, w, report)
    answer(client, report, w.extra, text="  ")  # tomt räknas som obesvarat
    by_question = {a["question_id"]: a for a in detail["answers"]}
    assert by_question[w.html["id"]]["boolean"] is True
    assert by_question[w.what["id"]]["choice_ids"] == [w.what["choices"][0]["id"]]
    assert by_question[w.difficulty["id"]]["rating"] == 3
    assert by_question[w.summary["id"]]["text"] == "Byggde en meny"
    assert by_question[w.summary["id"]]["rating"] is None


def test_empty_answer_removes_the_answer(client: TestClient, login: Login, w: World) -> None:
    login(w.student)
    report = start(client, w)
    answer(client, report, w.extra, text="Hej")
    detail = answer(client, report, w.extra, text="").json()
    assert detail["answers"] == []


@pytest.mark.parametrize(
    ("question", "value"),
    [
        ("html", {"text": "ja"}),  # fel sorts svar
        ("summary", {"rating": 3}),
        ("difficulty", {"rating": 6}),
        ("what", {"choice_ids": [str(uuid4())]}),  # alternativ som inte finns
        ("what", {"choice_ids": "both"}),  # två val på enkelval
        ("info", {"text": "Ok"}),  # meddelanden har inget svar
        ("extra", {"text": "x" * 501}),
        ("summary", {"unknown": 1}),
    ],
)
def test_invalid_answers_are_rejected(
    client: TestClient, login: Login, w: World, question: str, value: dict
) -> None:
    if value.get("choice_ids") == "both":
        value = {"choice_ids": [c["id"] for c in w.what["choices"]]}
    login(w.student)
    report = start(client, w)
    assert answer(client, report, getattr(w, question), **value).status_code == 422


def test_choice_with_other_text(client: TestClient, login: Login, w: World) -> None:
    login(w.student)
    report = start(client, w)
    detail = answer(client, report, w.what, other_text="Testade").json()
    assert detail["answers"][0]["other_text"] == "Testade"
    both = answer(client, report, w.what, choice_ids=[w.what["choices"][0]["id"]], other_text="x")
    assert both.status_code == 422


def test_unknown_question_gives_404(client: TestClient, login: Login, w: World) -> None:
    login(w.student)
    report = start(client, w)
    response = client.put(f"/api/reports/{report['id']}/answers/{uuid4()}", json={"text": "x"})
    assert response.status_code == 404


def test_report_keeps_its_form_version(client: TestClient, login: Login, w: World) -> None:
    login(w.student)
    report = start(client, w)
    client.post("/api/auth/logout")

    login(w.teacher)
    url = f"/api/classes/{w.ee22.id}/form"
    client.put(url, json={"questions": [q("long_text", "Ny fråga")]})
    client.post(f"{url}/publish")
    client.post("/api/auth/logout")

    login(w.student)
    detail = client.get(f"/api/reports/{report['id']}").json()
    assert detail["form_version"] == 1
    assert len(detail["questions"]) == len(w.questions)
    newer = start(client, w, FRIDAY)
    assert newer["form_version"] == 2


def test_students_cannot_see_each_others_reports(
    client: TestClient, login: Login, w: World
) -> None:
    login(w.student)
    report = start(client, w)
    client.post("/api/auth/logout")
    login(w.other_student)
    assert client.get(f"/api/reports/{report['id']}").status_code == 404
    assert answer(client, report, w.summary, text="x").status_code == 404


# --- Läraren ------------------------------------------------------------------------------


def test_teacher_cannot_see_drafts(client: TestClient, login: Login, w: World) -> None:
    login(w.student)
    report = start(client, w)
    client.post("/api/auth/logout")
    login(w.teacher)
    assert client.get(f"/api/reports/{report['id']}").status_code == 404
    assert client.get(f"/api/classes/{w.ee22.id}/reports").json() == []


def test_teacher_reads_submitted_reports(client: TestClient, login: Login, w: World) -> None:
    report = submitted(client, login, w)
    login(w.teacher)
    listing = client.get(f"/api/classes/{w.ee22.id}/reports").json()
    assert len(listing) == 1
    assert listing[0]["id"] == report["id"]
    assert listing[0]["is_read"] is False
    assert listing[0]["student"] == {"id": str(w.student.id), "name": "Testperson"}

    detail = client.get(f"/api/reports/{report['id']}").json()
    assert detail["is_read"] is False
    assert client.post(f"/api/reports/{report['id']}/read").status_code == 204
    assert client.post(f"/api/reports/{report['id']}/read").status_code == 204
    assert client.get(f"/api/reports/{report['id']}").json()["is_read"] is True
    assert client.get(f"/api/classes/{w.ee22.id}/reports?unread_only=true").json() == []
    by_student = client.get(f"/api/classes/{w.ee22.id}/reports?student_id={w.other_student.id}")
    assert by_student.json() == []


def test_other_teacher_gets_404(client: TestClient, login: Login, w: World) -> None:
    report = submitted(client, login, w)
    login(w.other_teacher)
    assert client.get(f"/api/reports/{report['id']}").status_code == 404
    assert client.get(f"/api/classes/{w.ee22.id}/reports").status_code == 404
    assert client.post(f"/api/reports/{report['id']}/read").status_code == 404


@pytest.mark.parametrize("who", ["admin", "principal"])
def test_school_staff_cannot_read_reports(
    client: TestClient, login: Login, w: World, who: str
) -> None:
    report = submitted(client, login, w)
    login(getattr(w, who))
    assert client.get(f"/api/reports/{report['id']}").status_code == 403
    assert client.get(f"/api/classes/{w.ee22.id}/reports").status_code == 403


def test_student_and_teacher_comment(client: TestClient, login: Login, w: World) -> None:
    report = submitted(client, login, w)
    url = f"/api/reports/{report['id']}/comments"

    login(w.teacher)
    teacher_comment = client.post(url, json={"body": "  Snyggt jobbat!  "})
    assert teacher_comment.status_code == 201
    assert teacher_comment.json()["body"] == "Snyggt jobbat!"
    assert teacher_comment.json()["author_role"] == "teacher"
    client.post("/api/auth/logout")

    login(w.student)
    assert client.post(url, json={"body": "Tack!"}).status_code == 201
    assert client.post(url, json={"body": "   "}).status_code == 422
    comments = client.get(f"/api/reports/{report['id']}").json()["comments"]
    assert [c["body"] for c in comments] == ["Snyggt jobbat!", "Tack!"]
    client.post("/api/auth/logout")

    login(w.other_student)
    assert client.post(url, json={"body": "Hej"}).status_code == 404


def test_cannot_comment_on_draft(client: TestClient, login: Login, w: World) -> None:
    login(w.student)
    report = start(client, w)
    response = client.post(f"/api/reports/{report['id']}/comments", json={"body": "Hej"})
    assert response.status_code == 409


# --- Granskningens fall -------------------------------------------------------------------


def test_removed_student_loses_access(client: TestClient, login: Login, w: World) -> None:
    login(w.student)
    report = start(client, w)
    client.post("/api/auth/logout")
    login(w.teacher)
    assert client.delete(f"/api/classes/{w.ee22.id}/students/{w.student.id}").status_code == 204
    client.post("/api/auth/logout")
    login(w.student)
    assert client.get(f"/api/reports/{report['id']}").status_code == 404
    assert answer(client, report, w.html, boolean=True).status_code == 404
    assert client.post(f"/api/reports/{report['id']}/submit").status_code == 404
    assert client.get("/api/reports/mine").json() == []


def test_removed_teacher_loses_access(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    report = submitted(client, login, w)
    w.ee22.teachers.remove(w.teacher)
    db.flush()
    login(w.teacher)
    assert client.get(f"/api/reports/{report['id']}").status_code == 404


def test_days_before_publish_or_enrolment_are_not_due(
    client: TestClient, login: Login, w: World, db: Session
) -> None:
    # Klassen fick frågor i går (tisdag) och eleven kom in då.
    yesterday = datetime(2026, 10, 20, 8, 0, tzinfo=UTC)
    db.execute(update(FormVersion).values(published_at=yesterday))
    db.flush()
    login(w.student)
    assert [i["due_date"] for i in client.get("/api/reports/mine").json()] == [str(TUESDAY)]
    response = client.post(
        "/api/reports", json={"class_id": str(w.ee22.id), "due_date": str(FRIDAY)}
    )
    assert response.status_code == 422

    db.execute(update(FormVersion).values(published_at=datetime(2026, 8, 1, tzinfo=UTC)))
    db.execute(
        update(class_students)
        .where(class_students.c.student_id == w.student.id)
        .values(created_at=datetime(2026, 10, 21, 6, 0, tzinfo=UTC))
    )
    db.flush()
    assert client.get("/api/reports/mine").json() == []


def test_lateness_uses_swedish_date(client: TestClient, login: Login, w: World) -> None:
    # 23:30 UTC på tisdagen är redan onsdag i svensk tid.
    with patch("app.core.time.now", return_value=datetime(2026, 10, 20, 23, 30, tzinfo=UTC)):
        report = submitted(client, login, w)
    assert report["is_late"] is True
    login(w.student)
    friday = start(client, w, FRIDAY)
    fill_all(client, w, friday)
    with patch("app.core.time.now", return_value=datetime(2026, 10, 16, 21, 30, tzinfo=UTC)):
        on_time = client.post(f"/api/reports/{friday['id']}/submit").json()
    assert on_time["is_late"] is False  # 23:30 svensk tid samma fredag


def test_first_matching_rule_wins_for_multiple_choice(
    client: TestClient, login: Login, w: World
) -> None:
    first, second = (str(uuid4()) for _ in range(2))
    end_question = q("long_text", "Sista")
    middle = q("long_text", "Mitten")
    multi = q(
        "choice",
        "Vad gjorde du?",
        multiple=True,
        choices=[{"id": first, "label": "A"}, {"id": second, "label": "B"}],
        logic=[{"when": second, "goto": None}, {"when": first, "goto": end_question["id"]}],
    )
    login(w.teacher)
    url = f"/api/classes/{w.ee22.id}/form"
    client.put(url, json={"questions": [multi, middle, end_question]})
    client.post(f"{url}/publish")
    client.post("/api/auth/logout")

    login(w.student)
    report = start(client, w, FRIDAY)
    path = answer(client, report, multi, choice_ids=[first, second]).json()["path"]
    assert path == [multi["id"]]  # regeln för B står först
    path = answer(client, report, multi, choice_ids=[first]).json()["path"]
    assert path == [multi["id"], end_question["id"]]
