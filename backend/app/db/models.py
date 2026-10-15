# Samlar alla modeller så att Alembic hittar dem vid autogenerate.
from app.db.base import Base  # noqa: F401
from app.models.user import User, UserSession  # noqa: F401
