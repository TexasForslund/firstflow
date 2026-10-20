"""Klassens frågeformulär: utkast, publicering, versioner och kontroll av frågorna."""

from collections.abc import Callable
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.school import School
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]


def text_question(title: str = "Vad har du gjort i dag?", **extra: Any) -> dict[str, Any]:
    return {"id": str(uuid4()), "type": "long_text", "title": title, **extra}


def yes_no(title: str = "Har du jobbat med HTML?", **extra: Any) -> dict[str, Any]:
    return {"id": str(uuid4()), "type": "yes_no", "title": title, **extra}


def choice(title: str = "Vad gjorde du?", n: int = 3, **extra: Any) -> dict[str, Any]:
    return {
        "id": str(uuid4()),
        "type": "choice",
        "title": title,
        "choices": [{"id": str(uuid4()), "label": f"Alternativ {i}"} for i in range(n)],
        **extra,
    }


@pytest.fixture
def setup(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> dict[str, Any]:
    kramfors, umea = make_school("Kramforsskolan"), make_school("Umeåskolan")
    teacher = make_user(email="ingrid@kramfors.se", in_school=kramfors)
    other = make_user(email="per@kramfors.se", in_school=kramfors)
    umea_teacher = make_user(email="anders@umea.se", in_school=umea)
    admin = make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors)
    principal = make_user(email="rektor@kramfors.se", role=UserRole.PRINCIPAL, in_school=kramfors)
    student = make_user(email="hugo@kramfors.se", role=UserRole.STUDENT, in_school=kramfors)
    ee22 = SchoolClass(school_id=kramfors.id, name="EE22", teachers=[teacher], students=[student])
    db.add(ee22)
    db.flush()
    return {
        "teacher": teacher,
        "other": other,
        "umea_teacher": umea_teacher,
        "admin": admin,
        "principal": principal,
        "student": student,
        "url": f"/api/classes/{ee22.id}/form",
    }


def test_new_class_has_empty_form(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["teacher"])
    assert client.get(setup["url"]).json() == {
        "draft": {"questions": []},
        "published_version": None,
        "published_at": None,
        "has_unpublished_changes": False,
    }


def test_draft_and_publish(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["teacher"])
    questions = [text_question(), yes_no()]
    saved = client.put(setup["url"], json={"questions": questions})
    assert saved.status_code == 200
    assert saved.json()["has_unpublished_changes"] is True
    assert saved.json()["published_version"] is None
    assert [q["id"] for q in saved.json()["draft"]["questions"]] == [q["id"] for q in questions]

    published = client.post(f"{setup['url']}/publish")
    assert published.status_code == 200
    assert published.json()["published_version"] == 1
    assert published.json()["has_unpublished_changes"] is False

    again = client.post(f"{setup['url']}/publish")
    assert again.status_code == 409

    client.put(setup["url"], json={"questions": [questions[1], questions[0]]})
    assert client.post(f"{setup['url']}/publish").json()["published_version"] == 2


def test_discard_returns_to_published(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["teacher"])
    assert client.post(f"{setup['url']}/discard").status_code == 409
    first = [text_question()]
    client.put(setup["url"], json={"questions": first})
    client.post(f"{setup['url']}/publish")
    client.put(setup["url"], json={"questions": first + [yes_no()]})

    discarded = client.post(f"{setup['url']}/discard").json()
    assert discarded["has_unpublished_changes"] is False
    assert [q["id"] for q in discarded["draft"]["questions"]] == [first[0]["id"]]


def test_cannot_publish_empty_form(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["teacher"])
    assert client.post(f"{setup['url']}/publish").status_code == 422


def test_school_admin_can_edit(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["admin"])
    assert client.put(setup["url"], json={"questions": [text_question()]}).status_code == 200


def test_principal_views_but_cannot_edit(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["principal"])
    assert client.get(setup["url"]).status_code == 200
    assert client.put(setup["url"], json={"questions": []}).status_code == 403
    assert client.post(f"{setup['url']}/publish").status_code == 403


@pytest.mark.parametrize("who", ["other", "umea_teacher"])
def test_teacher_without_class_gets_404(
    client: TestClient, login: Login, setup: dict, who: str
) -> None:
    login(setup[who])
    assert client.get(setup["url"]).status_code == 404
    assert client.put(setup["url"], json={"questions": []}).status_code == 404


def test_student_cannot_read_draft(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["student"])
    assert client.get(setup["url"]).status_code == 403


def _with_logic(rules: list[dict[str, Any]], after: list[dict[str, Any]]) -> list[dict]:
    question = yes_no(logic=rules)
    return [question, *after]


def test_logic_can_jump_forward_or_to_end(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["teacher"])
    later = text_question("Berätta mer")
    questions = _with_logic(
        [{"when": "yes", "goto": later["id"]}, {"when": "no", "goto": None}],
        [text_question("Mellan"), later],
    )
    assert client.put(setup["url"], json={"questions": questions}).status_code == 200


def _invalid_forms() -> list[list[dict[str, Any]]]:
    first = text_question()
    duplicate_choices = choice()
    duplicate_choices["choices"][1]["id"] = duplicate_choices["choices"][0]["id"]
    backwards = yes_no(logic=[{"when": "yes", "goto": first["id"]}])
    return [
        [first, {**text_question(), "id": first["id"]}],  # samma id två gånger
        [duplicate_choices],
        [first, backwards],  # logik bakåt
        [yes_no(logic=[{"when": "kanske", "goto": None}])],  # svar som inte finns
        [yes_no(logic=[{"when": "yes", "goto": str(uuid4())}])],  # fråga som inte finns
        [choice(n=1)],  # minst två alternativ
        [{**text_question(), "title": "   "}],
        [{"id": str(uuid4()), "type": "statement", "title": "Hej", "required": True}],
        [{"id": str(uuid4()), "type": "video", "title": "Filma"}],
        [text_question(logic=[])],  # logik bara på frågor med fasta svar
    ]


@pytest.mark.parametrize("questions", _invalid_forms())
def test_invalid_forms_are_rejected(
    client: TestClient, login: Login, setup: dict, questions: list[dict]
) -> None:
    login(setup["teacher"])
    assert client.put(setup["url"], json={"questions": questions}).status_code == 422


def test_rating_logic_uses_numbers(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["teacher"])
    rating = {
        "id": str(uuid4()),
        "type": "rating",
        "title": "Hur svårt var det?",
        "logic": [{"when": "5", "goto": None}],
    }
    assert client.put(setup["url"], json={"questions": [rating]}).status_code == 200
    rating["logic"] = [{"when": "6", "goto": None}]
    assert client.put(setup["url"], json={"questions": [rating]}).status_code == 422
