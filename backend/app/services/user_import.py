"""Import av elever och personal från en fil (B20, Texas 2026-11-02).

Filen följer mallen, som följer SS12000: id, förnamn, efternamn, e-post, roll, klass och
skolform. Den kan vara CSV eller Excel (.xlsx). Bara det som rör APL hämtas:

- Elever bara i klasserna som skoladmin väljer. Andra elever i filen hoppas över.
- Lärare bara om de undervisar i en vald klass. SYV och rektor alltid, de hör till skolan.
- Personnummer, adress, telefon och vårdnadshavare läses inte, även om de finns i filen.

En person känns igen på SS12000-id och annars på e-post, så att samma fil kan laddas upp
igen nästa termin. Inget sparas förrän skoladmin har sett förhandsvisningen (`plan`) och
importerar (`apply`). Loggen får bara antal, aldrig namn eller e-post.
"""

import csv
import io
import re
import uuid
from dataclasses import dataclass, field

from openpyxl import load_workbook
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.core.security import normalize_email
from app.models.school_class import SchoolClass, class_students
from app.models.user import User, UserRole
from app.services.accounts import NO_PASSWORD, create_account

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 5000

COLUMNS = ["id", "förnamn", "efternamn", "e-post", "roll", "klass", "skolform"]
EXAMPLE_ROWS = [
    ["", "Hugo", "Karlsson", "hugo.karlsson@skola.se", "Elev", "EL23", "GY"],
    ["", "Ingrid", "Svensson", "ingrid.svensson@skola.se", "Lärare", "EL23", ""],
    ["", "Lena", "Holm", "lena.holm@skola.se", "SYV", "", ""],
]

# Rubriker som betyder samma kolumn, t.ex. från en export ur skolans system.
HEADERS = {
    "id": "id",
    "ss12000-id": "id",
    "personid": "id",
    "förnamn": "first",
    "fornamn": "first",
    "givenname": "first",
    "efternamn": "last",
    "familyname": "last",
    "e-post": "email",
    "epost": "email",
    "e-postadress": "email",
    "email": "email",
    "mejl": "email",
    "roll": "role",
    "role": "role",
    "dutyrole": "role",
    "klass": "class",
    "grupp": "class",
    "group": "class",
    "skolform": "school_form",
    "schooltype": "school_form",
}

ROLES = {
    "elev": UserRole.STUDENT,
    "lärare": UserRole.TEACHER,
    "larare": UserRole.TEACHER,
    "syv": UserRole.SYV,
    "studie- och yrkesvägledare": UserRole.SYV,
    "rektor": UserRole.PRINCIPAL,
}

ROLE_LABEL = {
    UserRole.STUDENT: "Elev",
    UserRole.TEACHER: "Lärare",
    UserRole.SYV: "SYV",
    UserRole.PRINCIPAL: "Rektor",
}

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ImportFileError(ValueError):
    """Filen går inte att läsa. Meddelandet visas för skoladmin."""


@dataclass
class Row:
    number: int  # radnumret i filen, med rubriken som rad 1
    external_id: str | None
    name: str
    email: str
    role: UserRole
    class_name: str | None


@dataclass
class RowError:
    number: int
    message: str


@dataclass
class Person:
    """En person som läggs till eller ändras."""

    name: str
    email: str
    role: UserRole
    class_name: str | None
    what: str = ""  # vad som ändras, för ändrade


@dataclass
class ClassPlan:
    name: str
    exists: bool
    new_students: int = 0
    changed: int = 0
    leaving: int = 0
    teachers: list[str] = field(default_factory=list)


@dataclass
class Plan:
    file_classes: dict[str, tuple[int, int]]  # klass -> (elever, lärare) i filen
    selected: list[str]
    new: list[Person]
    changed: list[Person]
    leaving: list[Person]
    errors: list[RowError]
    classes: list[ClassPlan]
    skipped: int  # rader i klasser som inte är valda
    # Det som behövs för att genomföra planen.
    rows: list[Row] = field(default_factory=list)
    matches: dict[int, User] = field(default_factory=dict)  # radnummer -> befintlig person


def template_csv() -> bytes:
    out = io.StringIO()
    writer = csv.writer(out, delimiter=";")
    writer.writerow(COLUMNS)
    writer.writerows(EXAMPLE_ROWS)
    # BOM så att Excel öppnar filen med åäö.
    return ("﻿" + out.getvalue()).encode("utf-8")


def template_xlsx() -> bytes:
    from openpyxl import Workbook

    book = Workbook()
    sheet = book.active
    sheet.title = "Personer"
    sheet.append(COLUMNS)
    for row in EXAMPLE_ROWS:
        sheet.append(row)
    for column, width in zip("ABCDEFG", [16, 14, 16, 30, 10, 10, 10], strict=True):
        sheet.column_dimensions[column].width = width
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def _cells(data: bytes, filename: str) -> list[list[str]]:
    """Filens rader som text. Excel eller CSV, med semikolon eller komma."""
    if len(data) > MAX_FILE_BYTES:
        raise ImportFileError("Filen får vara högst 5 MB")
    if data.startswith(b"PK"):
        try:
            book = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        except Exception as exc:  # noqa: BLE001
            raise ImportFileError("Excelfilen går inte att läsa") from exc
        sheet = book.worksheets[0]
        rows = [
            ["" if v is None else str(v).strip() for v in row]
            for row in sheet.iter_rows(values_only=True)
        ]
        book.close()
        return rows
    if filename.lower().endswith((".xls", ".xlsm")):
        raise ImportFileError("Spara filen som .xlsx eller CSV")
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ImportFileError("Filen går inte att läsa. Spara den som CSV (UTF-8) eller .xlsx")
    first = text.splitlines()[0] if text else ""
    delimiter = ";" if first.count(";") >= first.count(",") else ","
    return [[c.strip() for c in row] for row in csv.reader(io.StringIO(text), delimiter=delimiter)]


def read_rows(data: bytes, filename: str) -> tuple[list[Row], list[RowError]]:
    """Läser filen. Rader med fel kommer med i felen, med radnummer."""
    cells = [r for r in _cells(data, filename)]
    if not cells or not any(cells[0]):
        raise ImportFileError("Filen är tom")
    header = [HEADERS.get(h.strip().lower()) for h in cells[0]]
    missing = {"first", "last", "email", "role"} - set(header)
    if missing:
        raise ImportFileError(
            "Filen saknar kolumner. Använd mallen: id, förnamn, efternamn, e-post, roll och klass"
        )
    if len(cells) - 1 > MAX_ROWS:
        raise ImportFileError(f"Filen får ha högst {MAX_ROWS} rader")

    rows: list[Row] = []
    errors: list[RowError] = []
    for number, values in enumerate(cells[1:], start=2):
        if not any(values):
            continue
        value = {
            key: values[i] if i < len(values) else ""
            for i, key in enumerate(header)
            if key is not None
        }
        name = f"{value.get('first', '')} {value.get('last', '')}".strip()
        email = value.get("email", "")
        role = ROLES.get(value.get("role", "").strip().lower())
        class_name = value.get("class", "").strip() or None
        if not name:
            errors.append(RowError(number, "Namn saknas."))
        elif not email:
            errors.append(
                RowError(number, "E-post saknas. Utan e-post kan personen inte få en inbjudan.")
            )
        elif not EMAIL.match(email):
            errors.append(RowError(number, "E-postadressen ser inte rätt ut."))
        elif role is None:
            errors.append(
                RowError(
                    number,
                    f"Rollen ”{value.get('role', '')}” finns inte. "
                    "Använd Elev, Lärare, SYV eller Rektor.",
                )
            )
        elif role == UserRole.STUDENT and class_name is None:
            errors.append(RowError(number, "Eleven har ingen klass."))
        elif class_name is not None and len(class_name) > 50:
            errors.append(RowError(number, "Klassens namn får vara högst 50 tecken."))
        else:
            rows.append(
                Row(
                    number=number,
                    external_id=value.get("id", "").strip()[:100] or None,
                    name=name[:200],
                    email=normalize_email(email),
                    role=role,
                    class_name=class_name,
                )
            )
    return rows, errors


def plan(db: Session, school_id: uuid.UUID, rows: list[Row], errors: list[RowError],
         selected: list[str]) -> Plan:  # fmt: skip
    """Vad som händer om filen importeras med de valda klasserna. Ändrar inget."""
    errors = list(errors)
    file_classes: dict[str, tuple[int, int]] = {}
    for row in rows:
        if row.class_name:
            students, teachers = file_classes.get(row.class_name, (0, 0))
            if row.role == UserRole.STUDENT:
                students += 1
            elif row.role == UserRole.TEACHER:
                teachers += 1
            file_classes[row.class_name] = (students, teachers)
    chosen = [c for c in selected if c in file_classes]

    # Raderna som gäller: elever och lärare i valda klasser, SYV och rektor alltid.
    relevant: list[Row] = []
    skipped = 0
    for row in rows:
        if row.role in (UserRole.SYV, UserRole.PRINCIPAL) or row.class_name in chosen:
            relevant.append(row)
        else:
            skipped += 1

    # En elev kan bara gå i en klass. Samma e-post får inte ha olika roller.
    seen: dict[str, Row] = {}
    keep: list[Row] = []
    for row in relevant:
        earlier = seen.get(row.email)
        if earlier is None:
            seen[row.email] = row
            keep.append(row)
        elif earlier.role != row.role:
            errors.append(
                RowError(row.number, f"Samma e-post har en annan roll på rad {earlier.number}.")
            )
        elif row.role == UserRole.STUDENT:
            errors.append(
                RowError(
                    row.number,
                    f"Eleven finns redan på rad {earlier.number}. En elev går i en klass.",
                )
            )
        else:
            keep.append(row)  # en lärare i flera klasser
    relevant = keep

    existing_classes = {
        c.name: c
        for c in db.scalars(
            select(SchoolClass)
            .where(SchoolClass.school_id == school_id, SchoolClass.name.in_(chosen))
            .options(selectinload(SchoolClass.students), selectinload(SchoolClass.teachers))
        )
    }
    by_external = {
        u.external_id: u
        for u in db.scalars(
            select(User).where(
                User.school_id == school_id,
                User.external_id.in_([r.external_id for r in relevant if r.external_id]),
            )
        )
    }
    by_email = {
        u.email: u
        for u in db.scalars(select(User).where(User.email.in_([r.email for r in relevant])))
    }
    current_class = dict(
        db.execute(
            select(class_students.c.student_id, SchoolClass.name)
            .join(SchoolClass, SchoolClass.id == class_students.c.class_id)
            .where(SchoolClass.school_id == school_id)
        ).all()
    )

    new: list[Person] = []
    changed: list[Person] = []
    matches: dict[int, User] = {}
    valid: list[Row] = []
    counted: set[str] = set()
    for row in relevant:
        user = by_external.get(row.external_id) if row.external_id else None
        user = user or by_email.get(row.email)
        if user is not None:
            if user.school_id != school_id:
                errors.append(
                    RowError(row.number, "E-postadressen används redan på en annan skola.")
                )
                continue
            if user.role != row.role:
                errors.append(
                    RowError(row.number, "E-postadressen används redan av någon med en annan roll.")
                )
                continue
            if user.email != row.email and row.email in by_email:
                errors.append(RowError(row.number, "E-postadressen används redan av någon annan."))
                continue
        valid.append(row)
        if row.email in counted:
            if user is not None:
                matches[row.number] = user
            continue  # en lärare i flera klasser räknas en gång
        counted.add(row.email)
        person = Person(row.name, row.email, row.role, row.class_name)
        if user is None:
            new.append(person)
            continue
        matches[row.number] = user
        what = []
        if user.name != row.name:
            what.append("namn")
        if user.email != row.email:
            what.append("e-post")
        if row.role == UserRole.STUDENT and current_class.get(user.id) != row.class_name:
            what.append(f"klass {current_class.get(user.id) or 'ingen'} → {row.class_name}")
        if not user.is_active:
            what.append("aktiveras igen")
        if what:
            person.what = ", ".join(what)
            changed.append(person)

    # Elever i en vald klass som inte finns kvar i filen lämnar klassen.
    in_file = {
        (r.class_name, matches[r.number].id if r.number in matches else r.email)
        for r in valid
        if r.role == UserRole.STUDENT
    }
    leaving: list[Person] = []
    for name, school_class in existing_classes.items():
        for student in school_class.students:
            if student.is_active and (name, student.id) not in in_file:
                leaving.append(Person(student.name, student.email, UserRole.STUDENT, name))

    classes: list[ClassPlan] = []
    for name in chosen:
        teachers = sorted(
            {r.name for r in valid if r.role == UserRole.TEACHER and r.class_name == name}
        )
        classes.append(
            ClassPlan(
                name=name,
                exists=name in existing_classes,
                new_students=sum(
                    1 for p in new if p.role == UserRole.STUDENT and p.class_name == name
                ),
                changed=sum(
                    1 for p in changed if p.role == UserRole.STUDENT and p.class_name == name
                ),
                leaving=sum(1 for p in leaving if p.class_name == name),
                teachers=teachers,
            )
        )
    errors.sort(key=lambda e: e.number)
    return Plan(
        file_classes=file_classes,
        selected=chosen,
        new=new,
        changed=changed,
        leaving=leaving,
        errors=errors,
        classes=classes,
        skipped=skipped,
        rows=valid,
        matches=matches,
    )


def apply(db: Session, school_id: uuid.UUID, result: Plan) -> list[User]:
    """Genomför planen. Returnerar personerna som ska få en inbjudan: nya, och befintliga som
    inte har valt lösenord än. Anroparen gör commit."""
    classes = {
        c.name: c
        for c in db.scalars(
            select(SchoolClass)
            .where(SchoolClass.school_id == school_id, SchoolClass.name.in_(result.selected))
            .options(selectinload(SchoolClass.students), selectinload(SchoolClass.teachers))
        )
    }
    for name in result.selected:
        if name not in classes:
            school_class = SchoolClass(school_id=school_id, name=name)
            db.add(school_class)
            classes[name] = school_class
    db.flush()

    people: dict[str, User] = {}
    for row in result.rows:
        user = result.matches.get(row.number) or people.get(row.email)
        if user is None:
            user = create_account(
                db, email=row.email, name=row.name, role=row.role, school_id=school_id
            )
        else:
            user.name = row.name
            user.email = row.email
            user.is_active = True
        if row.external_id:
            user.external_id = row.external_id
        people[row.email] = user
    db.flush()

    # Elever som lämnar en vald klass.
    staying = {
        people[r.email].id for r in result.rows if r.role == UserRole.STUDENT and r.email in people
    }
    for school_class in classes.values():
        gone = [s.id for s in school_class.students if s.id not in staying]
        if gone:
            db.execute(
                delete(class_students).where(
                    class_students.c.class_id == school_class.id,
                    class_students.c.student_id.in_(gone),
                )
            )
    db.flush()

    for row in result.rows:
        user = people[row.email]
        if row.role == UserRole.STUDENT and row.class_name:
            # En elev går i en klass. Byter hen klass tas den gamla kopplingen bort.
            db.execute(delete(class_students).where(class_students.c.student_id == user.id))
            db.execute(
                class_students.insert().values(
                    class_id=classes[row.class_name].id, student_id=user.id
                )
            )
        elif row.role == UserRole.TEACHER and row.class_name:
            school_class = classes[row.class_name]
            if user not in school_class.teachers:
                school_class.teachers.append(user)
    db.flush()
    return [u for u in people.values() if u.password_hash == NO_PASSWORD]


def role_label(role: UserRole) -> str:
    return ROLE_LABEL.get(role, str(role))
