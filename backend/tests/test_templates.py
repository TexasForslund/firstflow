"""Frågemallar: skolans och lärarens egna, spara från klass, använda i klass, behörigheter."""

from collections.abc import Callable
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.school import School
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole
from tests.test_forms import choice, text_question, yes_no

MakeUser = Callable[..., User]
Login = Callable[[User], None]


@pytest.fixture
def setup(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> dict[str, Any]:
    kramfors, umea = make_school("Kramforsskolan"), make_school("Umeåskolan")
    teacher = make_user(email="ingrid@kramfors.se", in_school=kramfors)
    other = make_user(email="per@kramfors.se", in_school=kramfors)
    umea_teacher = make_user(email="anders@umea.se", in_school=umea)
    admin = make_user(email="admin@kramfors.se", role=UserRole.SCHOOL_ADMIN, in_school=kramfors)
    umea_admin = make_user(email="admin@umea.se", role=UserRole.SCHOOL_ADMIN, in_school=umea)
    principal = make_user(email="rektor@kramfors.se", role=UserRole.PRINCIPAL, in_school=kramfors)
    student = make_user(email="hugo@kramfors.se", role=UserRole.STUDENT, in_school=kramfors)
    ee22 = SchoolClass(school_id=kramfors.id, name="EE22", teachers=[teacher])
    ee21 = SchoolClass(school_id=kramfors.id, name="EE21", teachers=[teacher])
    other_class = SchoolClass(school_id=kramfors.id, name="BA23", teachers=[other])
    umea_class = SchoolClass(school_id=umea.id, name="EE22", teachers=[umea_teacher])
    db.add_all([ee22, ee21, other_class, umea_class])
    db.flush()
    return {
        "teacher": teacher,
        "other": other,
        "umea_teacher": umea_teacher,
        "admin": admin,
        "umea_admin": umea_admin,
        "principal": principal,
        "student": student,
        "ee22": ee22.id,
        "ee21": ee21.id,
        "other_class": other_class.id,
        "umea_class": umea_class.id,
    }


def save_questions(client: TestClient, class_id: Any, questions: list[dict[str, Any]]) -> None:
    assert (
        client.put(f"/api/classes/{class_id}/form", json={"questions": questions}).status_code
        == 200
    )


def create(client: TestClient, class_id: Any, name: str = "Veckoredovisning") -> dict[str, Any]:
    response = client.post("/api/templates", json={"name": name, "class_id": str(class_id)})
    assert response.status_code == 201, response.text
    return response.json()


def test_teacher_saves_own_template(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["teacher"])
    questions = [text_question(), yes_no()]
    save_questions(client, setup["ee22"], questions)

    template = create(client, setup["ee22"], "  Min mall  ")
    assert template["name"] == "Min mall"
    assert template["scope"] == "personal"
    assert [q["id"] for q in template["content"]["questions"]] == [q["id"] for q in questions]
    assert [t["id"] for t in client.get("/api/templates").json()] == [template["id"]]


def test_admin_saves_school_template_visible_to_all_teachers(
    client: TestClient, login: Login, setup: dict
) -> None:
    login(setup["admin"])
    save_questions(client, setup["ee22"], [text_question()])
    template = create(client, setup["ee22"], "Skolans mall")
    assert template["scope"] == "school"

    login(setup["other"])
    assert [t["id"] for t in client.get("/api/templates").json()] == [template["id"]]
    login(setup["umea_teacher"])
    assert client.get("/api/templates").json() == []
    login(setup["umea_admin"])
    assert client.get("/api/templates").json() == []


def test_personal_templates_are_private(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["teacher"])
    save_questions(client, setup["ee22"], [text_question()])
    template = create(client, setup["ee22"])

    for user in ("other", "admin"):
        login(setup[user])
        assert client.get("/api/templates").json() == []
        assert (
            client.patch(f"/api/templates/{template['id']}", json={"name": "X"}).status_code == 404
        )
        assert client.delete(f"/api/templates/{template['id']}").status_code == 404
        apply = client.post(
            f"/api/classes/{setup['other_class']}/form/apply-template",
            json={"template_id": template["id"]},
        )
        assert apply.status_code == 404


def test_school_templates_listed_first(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["admin"])
    save_questions(client, setup["ee22"], [text_question()])
    school = create(client, setup["ee22"], "Ö skolmall")
    login(setup["teacher"])
    own = create(client, setup["ee22"], "A egen mall")
    assert [t["id"] for t in client.get("/api/templates").json()] == [school["id"], own["id"]]


def test_cannot_save_empty_form(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["teacher"])
    response = client.post("/api/templates", json={"name": "Tom", "class_id": str(setup["ee22"])})
    assert response.status_code == 422
    assert response.json()["detail"] == "Klassen har inga frågor att spara"


def test_cannot_save_from_class_without_access(
    client: TestClient, login: Login, setup: dict
) -> None:
    login(setup["teacher"])
    for class_id in (setup["other_class"], setup["umea_class"], uuid4()):
        response = client.post("/api/templates", json={"name": "Mall", "class_id": str(class_id)})
        assert response.status_code == 404


def test_blank_name_is_rejected(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["teacher"])
    save_questions(client, setup["ee22"], [text_question()])
    response = client.post("/api/templates", json={"name": "   ", "class_id": str(setup["ee22"])})
    assert response.status_code == 422


def test_apply_template_copies_with_new_ids(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["teacher"])
    first = choice("Vad gjorde du?", n=2)
    last = text_question("Berätta mer")
    first["logic"] = [{"when": first["choices"][0]["id"], "goto": last["id"]}]
    original = [first, yes_no(), last]
    save_questions(client, setup["ee22"], original)
    template = create(client, setup["ee22"])

    response = client.post(
        f"/api/classes/{setup['ee21']}/form/apply-template", json={"template_id": template["id"]}
    )
    assert response.status_code == 200
    form = response.json()
    assert form["has_unpublished_changes"] is True
    assert form["published_version"] is None
    copied = form["draft"]["questions"]
    assert [q["title"] for q in copied] == [q["title"] for q in original]
    # Nya id:n för frågor och alternativ, och logiken pekar om till kopiorna.
    assert {q["id"] for q in copied}.isdisjoint({q["id"] for q in original})
    assert copied[0]["choices"][0]["id"] != first["choices"][0]["id"]
    assert copied[0]["logic"] == [{"when": copied[0]["choices"][0]["id"], "goto": copied[2]["id"]}]
    assert client.post(f"/api/classes/{setup['ee21']}/form/publish").status_code == 200


def test_apply_template_replaces_published_questions_of_other_type(
    client: TestClient, login: Login, setup: dict
) -> None:
    """Mallen ersätter frågor som redan är publicerade, även med samma id men annan typ."""
    login(setup["teacher"])
    question = text_question("Samma fråga")
    save_questions(client, setup["ee22"], [question])
    template = create(client, setup["ee22"])
    save_questions(client, setup["ee21"], [{**question, "type": "short_text"}])
    assert client.post(f"/api/classes/{setup['ee21']}/form/publish").status_code == 200

    response = client.post(
        f"/api/classes/{setup['ee21']}/form/apply-template", json={"template_id": template["id"]}
    )
    assert response.status_code == 200
    assert client.post(f"/api/classes/{setup['ee21']}/form/publish").status_code == 200


def test_changing_template_does_not_change_class(
    client: TestClient, login: Login, setup: dict
) -> None:
    login(setup["teacher"])
    save_questions(client, setup["ee22"], [text_question()])
    template = create(client, setup["ee22"])
    client.post(
        f"/api/classes/{setup['ee21']}/form/apply-template", json={"template_id": template["id"]}
    )
    assert client.delete(f"/api/templates/{template['id']}").status_code == 204
    form = client.get(f"/api/classes/{setup['ee21']}/form").json()
    assert len(form["draft"]["questions"]) == 1


def test_teacher_cannot_apply_to_class_without_access(
    client: TestClient, login: Login, setup: dict
) -> None:
    login(setup["admin"])
    save_questions(client, setup["ee22"], [text_question()])
    template = create(client, setup["ee22"], "Skolans mall")
    login(setup["teacher"])
    response = client.post(
        f"/api/classes/{setup['other_class']}/form/apply-template",
        json={"template_id": template["id"]},
    )
    assert response.status_code == 404


def test_admin_can_apply_school_template(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["admin"])
    save_questions(client, setup["ee22"], [text_question()])
    template = create(client, setup["ee22"], "Skolans mall")
    response = client.post(
        f"/api/classes/{setup['other_class']}/form/apply-template",
        json={"template_id": template["id"]},
    )
    assert response.status_code == 200


def test_rename_and_delete(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["admin"])
    save_questions(client, setup["ee22"], [text_question()])
    school = create(client, setup["ee22"], "Skolans mall")
    login(setup["teacher"])
    own = create(client, setup["ee22"], "Egen")

    renamed = client.patch(f"/api/templates/{own['id']}", json={"name": "Nytt namn"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Nytt namn"
    # Läraren ser skolans mall men får inte ändra den.
    assert client.patch(f"/api/templates/{school['id']}", json={"name": "X"}).status_code == 403
    assert client.delete(f"/api/templates/{school['id']}").status_code == 403
    assert client.delete(f"/api/templates/{own['id']}").status_code == 204

    login(setup["admin"])
    assert client.patch(f"/api/templates/{school['id']}", json={"name": "Ny"}).status_code == 200
    assert client.delete(f"/api/templates/{school['id']}").status_code == 204
    assert client.get("/api/templates").json() == []


def test_other_school_admin_cannot_touch(client: TestClient, login: Login, setup: dict) -> None:
    login(setup["admin"])
    save_questions(client, setup["ee22"], [text_question()])
    template = create(client, setup["ee22"], "Skolans mall")
    login(setup["umea_admin"])
    assert client.patch(f"/api/templates/{template['id']}", json={"name": "X"}).status_code == 404
    assert client.delete(f"/api/templates/{template['id']}").status_code == 404


@pytest.mark.parametrize("role", ["principal", "student"])
def test_other_roles_forbidden(client: TestClient, login: Login, setup: dict, role: str) -> None:
    login(setup[role])
    assert client.get("/api/templates").status_code == 403
    response = client.post("/api/templates", json={"name": "Mall", "class_id": str(setup["ee22"])})
    assert response.status_code == 403


def test_requires_login(client: TestClient, setup: dict) -> None:
    assert client.get("/api/templates").status_code == 401
