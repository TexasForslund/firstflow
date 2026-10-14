from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# Fasta namn på index och constraints, så att Alembic-migreringar blir förutsägbara
# och går att ändra eller ta bort senare.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Basklass för alla databasmodeller. Importera nya modeller i app/db/models.py."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
