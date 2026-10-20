"""Gemensamma fixtures för testerna.

Testerna körs mot en egen PostgreSQL-databas (TEST_DATABASE_URL, standard
firstflow_test i samma server som utvecklingsdatabasen). Databasen skapas vid
behov och migreras med Alembic, så migreringarna testas också. Varje test körs i
en transaktion som rullas tillbaka efteråt.
"""

import os
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from alembic import command
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import get_db
from app.main import app
from app.models.school import School
from app.models.user import ROLES_WITHOUT_SCHOOL, User, UserRole

BACKEND_DIR = Path(__file__).resolve().parent.parent

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    make_url(settings.database_url).set(database="firstflow_test").render_as_string(False),
)


def _create_database_if_missing(url: str) -> None:
    target = make_url(url)
    admin = create_engine(target.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": target.database}
        )
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{target.database}"'))
    admin.dispose()


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    _create_database_if_missing(TEST_DATABASE_URL)
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    command.upgrade(config, "head")

    engine = create_engine(TEST_DATABASE_URL)
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """En session vars ändringar rullas tillbaka när testet är klart."""
    with engine.connect() as connection:
        transaction = connection.begin()
        session = Session(bind=connection, join_transaction_mode="create_savepoint")
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    """En testklient där API:t använder testets databassession."""
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


PASSWORD = "rätt-lösenord-123"
# Hashas en gång. Argon2 är medvetet långsamt och testerna skapar många användare.
PASSWORD_HASH = hash_password(PASSWORD)


@pytest.fixture
def make_school(db: Session) -> Callable[..., School]:
    """Skapar en skola."""

    def make(name: str = "Testskolan") -> School:
        school = School(name=name)
        db.add(school)
        db.flush()
        return school

    return make


@pytest.fixture
def school(make_school: Callable[..., School]) -> School:
    """Standardskolan som make_user använder när ingen skola anges."""
    return make_school()


@pytest.fixture
def make_user(db: Session, school: School) -> Callable[..., User]:
    """Skapar en användare med lösenordet PASSWORD.

    Roller som hör till en skola hamnar på standardskolan om ingen annan anges.
    """

    def make(
        email: str = "larare@skola.se",
        role: UserRole = UserRole.TEACHER,
        is_active: bool = True,
        in_school: School | None = None,
    ) -> User:
        if role in ROLES_WITHOUT_SCHOOL:
            school_id = None
        else:
            school_id = (in_school or school).id
        user = User(
            email=email,
            name="Testperson",
            role=role,
            school_id=school_id,
            password_hash=PASSWORD_HASH,
            is_active=is_active,
        )
        db.add(user)
        db.flush()
        return user

    return make


@pytest.fixture
def login(client: TestClient) -> Callable[[User], None]:
    """Loggar in testklienten som användaren."""

    def do_login(user: User) -> None:
        response = client.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
        assert response.status_code == 200

    return do_login
