"""Fyller databasen med demodata: två skolor med alla roller.

Kör från backend/ (eller i Docker: docker compose exec backend uv run python -m scripts.seed_demo):
    uv run python -m scripts.seed_demo

Alla demokonton har lösenordet demo-firstflow. Skriptet kan köras flera gånger:
konton och skolor som redan finns hoppas över. Det körs bara när ENVIRONMENT är
development eller test.
Varje skola får två klasser med fem elever var. Placeringar läggs till i B3.
"""

import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.school import School
from app.models.school_class import SchoolClass
from app.models.user import User, UserRole
from app.services.accounts import create_account

DEMO_PASSWORD = "demo-firstflow"
ALLOWED_ENVIRONMENTS = {"development", "test"}
DOMAIN = "demo.firstflow.se"

SCHOOLS = {
    "kramfors": "Kramforsskolan",
    "umea": "Umeåskolan",
}

STAFF = {
    "kramfors": [
        (UserRole.SCHOOL_ADMIN, "Lena Holmberg"),
        (UserRole.PRINCIPAL, "Per Sjölander"),
        (UserRole.SYV, "Karin Ek"),
        (UserRole.TEACHER, "Ingrid Svensson"),
    ],
    "umea": [
        (UserRole.SCHOOL_ADMIN, "Johan Westin"),
        (UserRole.PRINCIPAL, "Maria Lindgren"),
        (UserRole.SYV, "Sara Nyberg"),
        (UserRole.TEACHER, "Anders Bergström"),
    ],
}

STUDENTS = {
    "kramfors": [
        "Hugo Karlsson", "Elsa Lindqvist", "Omar Haddad", "Maja Nordström", "Liam Berg",
        "Alva Holm", "Noah Sandberg", "Ebba Forsberg", "William Öberg", "Saga Lundgren",
    ],
    "umea": [
        "Ella Nyström", "Oscar Håkansson", "Alice Sjöberg", "Lucas Engström", "Freja Lund",
        "Adam Johansson", "Astrid Hedlund", "Isak Strand", "Selma Lindberg", "Melvin Ek",
    ],
}  # fmt: skip

# Två klasser per skola. Skolans lärare har båda, eleverna delas fem och fem.
CLASSES = ["EE22", "EE21"]

ROLE_PREFIX = {
    UserRole.SCHOOL_ADMIN: "admin",
    UserRole.PRINCIPAL: "rektor",
    UserRole.SYV: "syv",
    UserRole.TEACHER: "larare",
}


def _slug(name: str) -> str:
    table = str.maketrans("åäöé", "aaoe")
    return name.lower().translate(table).replace(" ", ".")


def _ensure_user(db: Session, email: str, name: str, role: UserRole, school: School | None) -> bool:
    if db.scalar(select(User.id).where(User.email == email)):
        return False
    create_account(
        db,
        email=email,
        name=name,
        role=role,
        school_id=school.id if school else None,
        password_hash=hash_password(DEMO_PASSWORD),
    )
    return True


def _ensure_classes(db: Session, school: School, key: str) -> list[str]:
    """Skapar skolans demoklasser som saknas. Returnerar namnen på de nya."""
    created: list[str] = []
    teacher = db.scalar(select(User).where(User.email == f"larare.{key}@{DOMAIN}"))
    students = [
        db.scalar(select(User).where(User.email == f"{_slug(n)}.{key}@{DOMAIN}"))
        for n in STUDENTS[key]
    ]
    for i, class_name in enumerate(CLASSES):
        exists = db.scalar(
            select(SchoolClass.id).where(
                SchoolClass.school_id == school.id, SchoolClass.name == class_name
            )
        )
        if exists:
            continue
        school_class = SchoolClass(school_id=school.id, name=class_name)
        school_class.teachers = [teacher] if teacher else []
        school_class.students = [s for s in students[i * 5 : i * 5 + 5] if s]
        db.add(school_class)
        created.append(class_name)
    db.flush()
    return created


def seed(db: Session) -> list[tuple[str, str, str]]:
    """Skapar demodatan. Returnerar (e-post eller klass, roll, skola) för allt som skapades."""
    created: list[tuple[str, str, str]] = []

    def add(email: str, name: str, role: UserRole, school: School | None) -> None:
        if _ensure_user(db, email, name, role, school):
            created.append((email, role.value, school.name if school else "–"))

    add(f"superadmin@{DOMAIN}", "Firstflow Admin", UserRole.SUPERADMIN, None)

    for key, school_name in SCHOOLS.items():
        school = db.scalar(select(School).where(School.name == school_name))
        if school is None:
            school = School(name=school_name)
            db.add(school)
            db.flush()
        for role, name in STAFF[key]:
            add(f"{ROLE_PREFIX[role]}.{key}@{DOMAIN}", name, role, school)
        for name in STUDENTS[key]:
            add(f"{_slug(name)}.{key}@{DOMAIN}", name, UserRole.STUDENT, school)
        for class_name in _ensure_classes(db, school, key):
            created.append((f"klass {class_name}", "–", school.name))

    add(f"handledare@{DOMAIN}", "Gustav Lindahl", UserRole.SUPERVISOR, None)
    return created


def main() -> None:
    if settings.environment not in ALLOWED_ENVIRONMENTS:
        sys.exit(f"seed_demo körs bara i {', '.join(sorted(ALLOWED_ENVIRONMENTS))}.")
    with SessionLocal() as db:
        created = seed(db)
        db.commit()
    if not created:
        print("Demodatan finns redan. Inget nytt skapades.")
        return
    accounts = sum(1 for item in created if not item[0].startswith("klass "))
    print(f"Skapade {accounts} demokonton och {len(created) - accounts} klasser.")
    print(f"Lösenord för alla konton: {DEMO_PASSWORD}\n")
    for email, role, school in created:
        print(f"  {role:<13} {school:<15} {email}")


if __name__ == "__main__":
    main()
