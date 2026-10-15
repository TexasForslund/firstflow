"""Skapar ett användarkonto. Lösenordet frågas efter och visas aldrig.

Kör från backend/:
    uv run python -m scripts.create_user --email anna@skola.se --name "Anna Lärare" --role teacher
"""

import argparse
import getpass
import sys

from sqlalchemy import select

from app.core.security import hash_password, normalize_email
from app.db.session import SessionLocal
from app.models.user import User, UserRole

MIN_PASSWORD_LENGTH = 10


def main() -> None:
    parser = argparse.ArgumentParser(description="Skapa ett användarkonto i Firstflow.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--role", required=True, choices=[r.value for r in UserRole])
    args = parser.parse_args()

    email = normalize_email(args.email)
    password = getpass.getpass("Lösenord: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Lösenordet måste ha minst {MIN_PASSWORD_LENGTH} tecken.")
    if password != getpass.getpass("Upprepa lösenordet: "):
        sys.exit("Lösenorden är inte likadana.")

    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == email)):
            sys.exit("Det finns redan ett konto med den e-postadressen.")
        db.add(
            User(
                email=email,
                name=args.name.strip(),
                role=UserRole(args.role),
                password_hash=hash_password(password),
            )
        )
        db.commit()
    print("Kontot är skapat.")


if __name__ == "__main__":
    main()
