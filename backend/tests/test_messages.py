"""Meddelanden (B11, Texas 2026-11-02)."""

import contextlib
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.routes import messages as messages_route
from app.core import time
from app.models.placement import Placement, Workplace
from app.models.project import Project
from app.models.school import School
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20


@dataclass
class World:
    teacher: User
    other_teacher: User
    hugo: User
    maja: User
    stranger: User
    gustav: User
    other_supervisor: User
    syv: User
    workplace: Workplace
    project: Project


def named(user: User, name: str) -> User:
    user.name = name
    return user


@pytest.fixture
def mail() -> Iterator[MagicMock]:
    with patch("app.api.routes.messages.send_email") as send:
        yield send


@pytest.fixture
def w(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> World:
    school = make_school("Kramforsskolan")
    teacher = named(make_user(email="anna@skola.se", in_school=school), "Anna Lind")
    other_teacher = named(make_user(email="per@skola.se", in_school=school), "Per Berg")
    hugo = named(
        make_user(email="hugo@skola.se", role=UserRole.STUDENT, in_school=school), "Hugo Karlsson"
    )
    maja = named(
        make_user(email="maja@skola.se", role=UserRole.STUDENT, in_school=school), "Maja Nord"
    )
    stranger = named(
        make_user(email="sara@skola.se", role=UserRole.STUDENT, in_school=school), "Sara Ek"
    )
    gustav = named(make_user(email="gustav@el.se", role=UserRole.SUPERVISOR), "Gustav Ek")
    other_supervisor = named(make_user(email="lisa@bygg.se", role=UserRole.SUPERVISOR), "Lisa")
    syv = named(make_user(email="syv@skola.se", role=UserRole.SYV, in_school=school), "Lena SYV")
    el23 = SchoolClass(school_id=school.id, name="EL23", teachers=[teacher], students=[hugo, maja])
    workplace = Workplace(school_id=school.id, name="Kramfors El", supervisors=[gustav])
    db.add_all([el23, workplace])
    db.flush()
    today = date.today()
    db.add(
        Placement(
            student=hugo,
            workplace=workplace,
            supervisor=gustav,
            start_date=today - timedelta(days=7),
            end_date=today + timedelta(days=30),
        )
    )
    project = Project(
        school_id=school.id,
        owner_id=teacher.id,
        name="Elcentral",
        workplace_id=workplace.id,
        students=[hugo],
    )
    db.add(project)
    db.flush()
    return World(
        teacher,
        other_teacher,
        hugo,
        maja,
        stranger,
        gustav,
        other_supervisor,
        syv,
        workplace,
        project,
    )


def start(client: TestClient, *people: User, name: str | None = None) -> dict:
    response = client.post(
        "/api/messages/conversations",
        json={"member_ids": [str(p.id) for p in people], "name": name},
    )
    assert response.status_code == 200, response.text
    return response.json()


def send(client: TestClient, conversation_id: str, **data: object) -> dict:
    files = data.pop("files", None)
    response = client.post(
        f"/api/messages/conversations/{conversation_id}/messages", data=data, files=files
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_contacts_follow_the_rules(client: TestClient, login: Login, w: World) -> None:
    login(w.teacher)
    names = [c["name"] for c in client.get("/api/messages/contacts").json()]
    # Lärarens elever och deras handledare, inte andra elever eller handledare.
    assert names == ["Gustav Ek", "Hugo Karlsson", "Maja Nord"]
    assert client.get("/api/messages/contacts").json()[0]["description"] == (
        "Handledare · Kramfors El"
    )

    login(w.gustav)
    assert [c["name"] for c in client.get("/api/messages/contacts").json()] == [
        "Anna Lind",
        "Hugo Karlsson",
    ]
    login(w.hugo)
    assert [c["name"] for c in client.get("/api/messages/contacts").json()] == [
        "Anna Lind",
        "Gustav Ek",
        "Lena SYV",
    ]


def test_direct_conversation_is_reused(client: TestClient, login: Login, w: World) -> None:
    login(w.teacher)
    first = start(client, w.hugo)
    assert first["title"] == "Hugo Karlsson" and first["is_group"] is False
    assert start(client, w.hugo)["id"] == first["id"]
    # Inte någon läraren inte har.
    response = client.post("/api/messages/conversations", json={"member_ids": [str(w.stranger.id)]})
    assert response.status_code == 422


def test_group_messages_and_unread(
    client: TestClient, login: Login, w: World, mail: MagicMock
) -> None:
    login(w.teacher)
    group = start(client, w.hugo, w.gustav)
    assert group["is_group"] is True and group["title"] == "Gustav och Hugo"
    send(client, group["id"], text="Hej båda!")
    assert mail.call_count == 2
    # Mejlet innehåller inte texten.
    assert all("Hej båda" not in c.args[2] for c in mail.call_args_list)

    send(client, group["id"], text="En sak till")
    # Inget nytt mejl förrän de har läst.
    assert mail.call_count == 2

    login(w.gustav)
    assert client.get("/api/messages/unread").json() == {"count": 2}
    listed = client.get("/api/messages/conversations").json()
    assert [(c["title"], c["unread"], c["preview"]) for c in listed] == [
        ("Anna och Hugo", 2, "Anna: En sak till")
    ]
    page = client.get(f"/api/messages/conversations/{group['id']}/messages").json()
    assert [(m["sender_name"], m["text"], m["mine"]) for m in page["messages"]] == [
        ("Anna Lind", "Hej båda!", False),
        ("Anna Lind", "En sak till", False),
    ]
    assert client.post(f"/api/messages/conversations/{group['id']}/read").status_code == 204
    assert client.get("/api/messages/unread").json() == {"count": 0}
    send(client, group["id"], text="Tack!")

    # Den som inte är med ser inget.
    login(w.maja)
    assert client.get(f"/api/messages/conversations/{group['id']}/messages").status_code == 404
    assert client.get("/api/messages/conversations").json() == []


def test_online_users_get_no_mail(
    client: TestClient, login: Login, w: World, mail: MagicMock, db: Session
) -> None:
    w.hugo.last_seen_at = time.now()
    db.flush()
    login(w.teacher)
    send(client, start(client, w.hugo)["id"], text="Hej")
    assert mail.call_count == 0


def test_images_files_and_projects(
    client: TestClient, login: Login, w: World, mail: MagicMock
) -> None:
    login(w.teacher)
    group = start(client, w.hugo, w.gustav)
    choices = client.get(f"/api/messages/conversations/{group['id']}/projects").json()
    assert [p["name"] for p in choices] == ["Elcentral"]

    message = send(
        client,
        group["id"],
        project_id=str(w.project.id),
        files=[
            ("files", ("matare.png", PNG, "image/png")),
            ("files", ("../ritning.html", b"<script>alert(1)</script>", "text/html")),
        ],
    )
    assert message["project"]["url"] == f"/projects/{w.project.id}"
    image, other = message["attachments"]
    assert (image["filename"], image["is_image"]) == ("matare.png", True)
    assert (other["filename"], other["is_image"]) == ("ritning.html", False)

    # Bilden visas, andra filer laddas ner.
    shown = client.get(image["url"])
    assert shown.headers["content-type"] == "image/png"
    assert shown.headers["content-disposition"].startswith("inline")
    downloaded = client.get(other["url"])
    assert downloaded.headers["content-type"] == "application/octet-stream"
    assert downloaded.headers["content-disposition"].startswith("attachment")

    # Hugo ser projektet på sin egen sida. Handledaren är inte inbjuden och får ingen länk.
    login(w.hugo)
    page = client.get(f"/api/messages/conversations/{group['id']}/messages").json()
    assert page["messages"][0]["project"]["url"] == f"/my-projects/{w.project.id}"
    login(w.gustav)
    page = client.get(f"/api/messages/conversations/{group['id']}/messages").json()
    assert page["messages"][0]["project"]["url"] is None

    login(w.maja)
    assert client.get(image["url"]).status_code == 404


def test_cannot_share_other_project_or_empty(
    client: TestClient, login: Login, w: World, mail: MagicMock
) -> None:
    login(w.teacher)
    direct = start(client, w.maja)
    url = f"/api/messages/conversations/{direct['id']}/messages"
    # Maja är inte med i projektet.
    assert client.post(url, data={"project_id": str(w.project.id)}).status_code == 422
    assert client.post(url, data={"text": "   "}).status_code == 422
    too_big = b"\x00" * (messages_route.MAX_FILE_BYTES + 1)
    response = client.post(url, files=[("files", ("stor.pdf", too_big, "application/pdf"))])
    assert response.status_code == 422


def test_placement_creates_group(client: TestClient, login: Login, w: World, db: Session) -> None:
    login(w.teacher)
    today = date.today()
    response = client.post(
        "/api/placements",
        json={
            "student_id": str(w.maja.id),
            "workplace_id": str(w.workplace.id),
            "supervisor_id": str(w.gustav.id),
            "start_date": str(today),
            "end_date": str(today + timedelta(days=20)),
        },
    )
    assert response.status_code == 201, response.text
    listed = client.get("/api/messages/conversations").json()
    assert [(c["title"], c["is_placement_group"]) for c in listed] == [
        ("Maja på Kramfors El", True)
    ]
    assert sorted(m["name"] for m in listed[0]["members"]) == ["Gustav Ek", "Maja Nord"]
    found = client.get("/api/messages/placement-group", params={"student_id": str(w.maja.id)})
    assert found.json()["id"] == listed[0]["id"]
    login(w.other_teacher)
    found = client.get("/api/messages/placement-group", params={"student_id": str(w.maja.id)})
    assert found.status_code == 404


def test_only_message_roles(
    client: TestClient, login: Login, w: World, make_user: MakeUser
) -> None:
    admin = make_user(email="admin@skola.se", role=UserRole.SCHOOL_ADMIN)
    login(admin)
    assert client.get("/api/messages/conversations").status_code == 403


def test_events_stream(
    client: TestClient, login: Login, w: World, db: Session, mail: MagicMock
) -> None:
    login(w.teacher)
    send(client, start(client, w.hugo)["id"], text="Hej")
    login(w.hugo)

    @contextlib.contextmanager
    def same_session() -> Iterator[Session]:
        yield db

    with (
        patch.object(messages_route, "session_scope", same_session),
        patch.object(messages_route, "STREAM_SECONDS", 0.05),
        patch.object(messages_route, "TICK_SECONDS", 0.01),
    ):
        response = client.get("/api/messages/events")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert 'event: messages\ndata: {"unread": 1' in response.text
    assert w.hugo.last_seen_at is not None

    client.post("/api/auth/logout")
    with patch.object(messages_route, "session_scope", same_session):
        assert client.get("/api/messages/events").status_code == 401
