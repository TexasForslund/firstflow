"""Fyller databasen med demodata: två skolor med alla roller.

Kör från backend/ (eller i Docker: docker compose exec backend uv run python -m scripts.seed_demo):
    uv run python -m scripts.seed_demo

Alla demokonton har lösenordet demo-firstflow. Skriptet kan köras flera gånger:
konton och skolor som redan finns hoppas över. Det vägrar köra när ENVIRONMENT=production.
Klasser läggs till i B2 och placeringar i B3.
"""

import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.school import School
from app.models.user import User, UserRole
from app.services.accounts import create_account

DEMO_PASSWORD = "demo-firstflow"
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


def seed(db: Session) -> list[tuple[str, str, str]]:
    """Skapar demodatan. Returnerar (e-post, roll, skola) för varje nytt konto."""
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

    add(f"handledare@{DOMAIN}", "Gustav Lindahl", UserRole.SUPERVISOR, None)
    return created


def main() -> None:
    if settings.environment == "production":
        sys.exit("seed_demo körs inte i produktion.")
    with SessionLocal() as db:
        created = seed(db)
        db.commit()
    if not created:
        print("Demodatan finns redan. Inget nytt skapades.")
        return
    print(f"Skapade {len(created)} demokonton. Lösenord för alla: {DEMO_PASSWORD}\n")
    for email, role, school in created:
        print(f"  {role:<13} {school:<15} {email}")


if __name__ == "__main__":
    main()
