"""Skapar ett användarkonto. Lösenordet frågas efter och visas aldrig.

Kör från backend/:
    uv run python -m scripts.create_user --email admin@firstflow.se --name "Admin" --role superadmin
    uv run python -m scripts.create_user --email anna@skola.se --name "Anna Lärare" \\
        --role teacher --school-id <uuid>

Superadmin och handledare (supervisor) har ingen skola. Alla andra roller kräver --school-id.
Skolornas id:n listas med: uv run python -m scripts.create_user --list-schools
"""

import argparse
import getpass
import sys
import uuid

from fastapi import HTTPException
from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.school import School
from app.models.user import ROLES_WITHOUT_SCHOOL, UserRole
from app.services.accounts import AccountCreate, create_account

MIN_PASSWORD_LENGTH = 10


def list_schools() -> None:
    with SessionLocal() as db:
        schools = db.scalars(select(School).order_by(School.name)).all()
    if not schools:
        print("Det finns inga skolor än.")
    for school in schools:
        print(f"{school.id}  {school.name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Skapa ett användarkonto i Firstflow.")
    parser.add_argument("--list-schools", action="store_true", help="Visa skolornas id:n")
    parser.add_argument("--email")
    parser.add_argument("--name")
    parser.add_argument("--role", choices=[r.value for r in UserRole])
    parser.add_argument(
        "--school-id", type=uuid.UUID, help="Krävs för alla roller utom superadmin och supervisor"
    )
    args = parser.parse_args()

    if args.list_schools:
        list_schools()
        return
    if not (args.email and args.name and args.role):
        parser.error("--email, --name och --role krävs")

    role = UserRole(args.role)
    if role in ROLES_WITHOUT_SCHOOL and args.school_id:
        sys.exit(f"Rollen {role} tillhör ingen skola. Ta bort --school-id.")
    if role not in ROLES_WITHOUT_SCHOOL and not args.school_id:
        sys.exit(f"Rollen {role} kräver --school-id. Visa skolorna med --list-schools.")

    try:
        account = AccountCreate(email=args.email, name=args.name)
    except ValueError as error:
        sys.exit(f"Ogiltiga uppgifter: {error}")

    password = getpass.getpass("Lösenord: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Lösenordet måste ha minst {MIN_PASSWORD_LENGTH} tecken.")
    if password != getpass.getpass("Upprepa lösenordet: "):
        sys.exit("Lösenorden är inte likadana.")

    with SessionLocal() as db:
        if args.school_id and db.get(School, args.school_id) is None:
            sys.exit("Skolan finns inte. Visa skolorna med --list-schools.")
        try:
            create_account(
                db,
                email=account.email,
                name=account.name,
                role=role,
                school_id=args.school_id,
                password_hash=hash_password(password),
            )
        except HTTPException as error:
            sys.exit(str(error.detail))
        db.commit()
    print("Kontot är skapat.")


if __name__ == "__main__":
    main()
