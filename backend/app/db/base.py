from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Basklass för alla databasmodeller. Importera nya modeller i app/db/models.py."""
