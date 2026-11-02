"""Import av elever och personal (B20, Texas 2026-11-02)."""

import io
import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.school import School
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole

MakeUser = Callable[..., User]
Login = Callable[[User], None]

CSV = """id;förnamn;efternamn;e-post;roll;klass;skolform;personnummer
a1;Hugo;Karlsson;Hugo.Karlsson@skola.se;Elev;EL23;GY;200801011234
a2;Maja;Nord;maja@skola.se;Elev;EL23;GY;
a3;Ingrid;Svensson;ingrid@skola.se;Lärare;EL23;;
a3;Ingrid;Svensson;ingrid@skola.se;Lärare;EE22;;
a4;Omar;Haddad;omar@skola.se;Elev;EE22;GY;
a5;Lena;Holm;lena@skola.se;SYV;;;
a6;Nils;Berg;nils@skola.se;Elev;NA23;GY;
a7;Utan;Epost;;Elev;EL23;GY;
a8;Fel;Roll;fel@skola.se;Elevassistent;EL23;;
"""


@dataclass
class World:
    school: School
    admin: User
    teacher: User
    liam: User
    ee22: SchoolClass
    other_school_user: User


@pytest.fixture
def mail() -> Iterator[MagicMock]:
    with patch("app.api.routes.invitations.send_email") as send:
        yield send


@pytest.fixture
def w(db: Session, make_school: Callable[..., School], make_user: MakeUser) -> World:
    school, other = make_school("Kramforsskolan"), make_school("Umeåskolan")
    admin = make_user(email="admin@skola.se", role=UserRole.SCHOOL_ADMIN, in_school=school)
    teacher = make_user(email="per@skola.se", in_school=school)
    liam = make_user(email="liam@skola.se", role=UserRole.STUDENT, in_school=school)
    liam.name = "Liam Berg"
    ee22 = SchoolClass(school_id=school.id, name="EE22", teachers=[teacher], students=[liam])
    db.add(ee22)
    elsewhere = make_user(email="nils@skola.se", role=UserRole.STUDENT, in_school=other)
    db.flush()
    return World(school, admin, teacher, liam, ee22, elsewhere)


def files(text: str = CSV, name: str = "elever.csv") -> dict:
    return {"file": (name, text.encode("utf-8"), "text/csv")}


def test_preview_lists_classes_in_file(client: TestClient, login: Login, w: World) -> None:
    login(w.admin)
    response = client.post("/api/import/preview", files=files())
    assert response.status_code == 200, response.text
    body = response.json()
    assert [
        (c["name"], c["students"], c["teachers"], c["exists"]) for c in body["file_classes"]
    ] == [
        ("EE22", 1, 1, True),
        ("EL23", 2, 1, False),
        ("NA23", 1, 0, False),
    ]
    assert body["selected"] == []
    # Rader med fel syns redan nu, med radnummer.
    assert [(e["row"], e["message"][:12]) for e in body["errors"]] == [
        (9, "E-post sakna"),
        (10, "Rollen ”Elev"),
    ]


def test_preview_with_classes(client: TestClient, login: Login, w: World) -> None:
    login(w.admin)
    data = {"classes": ["EL23", "EE22"]}
    body = client.post("/api/import/preview", files=files(), data=data).json()
    assert sorted(body["selected"]) == ["EE22", "EL23"]
    assert [(p["name"], p["role"], p["class_name"]) for p in body["new"]] == [
        ("Hugo Karlsson", "Elev", "EL23"),
        ("Maja Nord", "Elev", "EL23"),
        ("Ingrid Svensson", "Lärare", "EL23"),
        ("Omar Haddad", "Elev", "EE22"),
        ("Lena Holm", "SYV", None),
    ]
    # Liam går i EE22 men finns inte i filen.
    assert [(p["name"], p["class_name"]) for p in body["leaving"]] == [("Liam Berg", "EE22")]
    # Nils i NA23 hoppas över, klassen är inte vald.
    assert body["skipped"] == 1
    plans = {c["name"]: c for c in body["classes"]}
    assert plans["EL23"]["exists"] is False and plans["EL23"]["new_students"] == 2
    assert plans["EE22"]["teachers"] == ["Ingrid Svensson"]
    assert plans["EE22"]["leaving"] == 1


def test_run_imports_and_invites(
    client: TestClient, login: Login, w: World, db: Session, mail: MagicMock
) -> None:
    login(w.admin)
    data = {"classes": ["EL23", "EE22"]}
    response = client.post("/api/import/run", files=files(), data=data)
    assert response.status_code == 200, response.text
    assert response.json() == {"created": 5, "changed": 0, "left": 1, "invited": 5, "errors": 2}

    el23 = db.scalar(select(SchoolClass).where(SchoolClass.name == "EL23"))
    assert el23 is not None
    db.refresh(el23)
    assert [s.name for s in el23.students] == ["Hugo Karlsson", "Maja Nord"]
    assert [t.name for t in el23.teachers] == ["Ingrid Svensson"]
    db.refresh(w.ee22)
    assert [s.name for s in w.ee22.students] == ["Omar Haddad"]
    assert sorted(t.name for t in w.ee22.teachers) == ["Ingrid Svensson", "Testperson"]
    hugo = db.scalar(select(User).where(User.email == "hugo.karlsson@skola.se"))
    assert hugo is not None and hugo.external_id == "a1" and hugo.school_id == w.school.id
    # Personnummer läses inte.
    assert "200801011234" not in str(hugo.__dict__)
    assert mail.call_count == 5
    assert "Välj lösenord" in mail.call_args.args[2]

    # Samma fil igen: inget nytt, inga fler inbjudningar till dem som inte har valt lösenord än
    # utom en ny länk.
    again = client.post("/api/import/run", files=files(), data=data).json()
    assert again["created"] == 0 and again["changed"] == 0 and again["left"] == 0


def test_change_is_detected_by_ss12000_id(
    client: TestClient, login: Login, w: World, db: Session, mail: MagicMock
) -> None:
    login(w.admin)
    data = {"classes": ["EL23", "EE22"]}
    client.post("/api/import/run", files=files(), data=data)
    moved = CSV.replace(
        "a1;Hugo;Karlsson;Hugo.Karlsson@skola.se;Elev;EL23",
        "a1;Hugo;Karlsson;hugo.k@skola.se;Elev;EE22",
    )
    body = client.post("/api/import/preview", files=files(moved), data=data).json()
    assert [(p["name"], p["what"]) for p in body["changed"]] == [
        ("Hugo Karlsson", "e-post, klass EL23 → EE22")
    ]
    client.post("/api/import/run", files=files(moved), data=data)
    hugo = db.scalar(select(User).where(User.external_id == "a1"))
    assert hugo is not None and hugo.email == "hugo.k@skola.se"
    db.refresh(w.ee22)
    assert "Hugo Karlsson" in [s.name for s in w.ee22.students]


def test_conflicts_are_row_errors(client: TestClient, login: Login, w: World) -> None:
    login(w.admin)
    text = CSV + "x;Per;Lärare;per@skola.se;Elev;EL23;GY;\n"
    body = client.post(
        "/api/import/preview", files=files(text), data={"classes": ["EL23", "NA23"]}
    ).json()
    messages = {e["row"]: e["message"] for e in body["errors"]}
    # Nils går på en annan skola, och Per är lärare.
    assert messages[8] == "E-postadressen används redan på en annan skola."
    assert messages[11] == "E-postadressen används redan av någon med en annan roll."


def test_excel_file(client: TestClient, login: Login, w: World) -> None:
    book = Workbook()
    sheet = book.active
    for line in CSV.strip().splitlines():
        sheet.append(line.split(";"))
    out = io.BytesIO()
    book.save(out)
    login(w.admin)
    response = client.post(
        "/api/import/preview",
        files={"file": ("elever.xlsx", out.getvalue(), "application/octet-stream")},
        data={"classes": ["EL23"]},
    )
    assert response.status_code == 200, response.text
    assert len(response.json()["new"]) == 4


def test_bad_files(client: TestClient, login: Login, w: World) -> None:
    login(w.admin)
    assert client.post("/api/import/preview", files=files("")).status_code == 422
    response = client.post("/api/import/preview", files=files("namn;telefon\nHugo;070\n"))
    assert response.status_code == 422
    assert "saknar kolumner" in response.json()["detail"]
    old_excel = {"file": ("elever.xls", b"\xd0\xcf\x11\xe0", "application/vnd.ms-excel")}
    assert client.post("/api/import/preview", files=old_excel).status_code == 422
    # Importera kräver minst en klass.
    assert client.post("/api/import/run", files=files()).status_code == 422


def test_templates(client: TestClient, login: Login, w: World) -> None:
    login(w.admin)
    csv_file = client.get("/api/import/template", params={"format": "csv"})
    assert csv_file.status_code == 200
    assert csv_file.content.decode("utf-8-sig").startswith("id;förnamn;efternamn;e-post;roll")
    xlsx = client.get("/api/import/template")
    sheet = load_workbook(io.BytesIO(xlsx.content)).active
    assert [c.value for c in sheet[1]][:4] == ["id", "förnamn", "efternamn", "e-post"]


def test_only_school_admin(client: TestClient, login: Login, w: World) -> None:
    login(w.teacher)
    assert client.post("/api/import/preview", files=files()).status_code == 403
    assert client.get("/api/import/template").status_code == 403


def test_imported_person_chooses_password(
    client: TestClient, login: Login, w: World, mail: MagicMock
) -> None:
    login(w.admin)
    client.post("/api/import/run", files=files(), data={"classes": ["EL23"]})
    body = next(c.args[2] for c in mail.call_args_list if c.args[0] == "maja@skola.se")
    match = re.search(r"/invite/([A-Za-z0-9_-]+)", body)
    assert match
    token = match.group(1)
    client.post("/api/auth/logout")

    preview = client.get(f"/api/invite/{token}").json()
    assert preview["kind"] == "account" and preview["account_name"] == "Maja Nord"
    response = client.post(f"/api/invite/{token}/accept", json={"password": "ett-langt-losenord"})
    assert response.status_code == 200, response.text
    assert response.json()["role"] == "student"
    client.post("/api/auth/logout")
    login_body = {"email": "maja@skola.se", "password": "ett-langt-losenord"}
    assert client.post("/api/auth/login", json=login_body).status_code == 200
    # Länken går inte att använda igen.
    assert client.get(f"/api/invite/{token}").status_code == 404
