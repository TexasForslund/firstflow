# Samlar alla modeller så att Alembic hittar dem vid autogenerate.
from app.db.base import Base  # noqa: F401
from app.models.school import School  # noqa: F401
from app.models.school_class import SchoolClass, class_students, class_teachers  # noqa: F401
from app.models.user import User, UserSession  # noqa: F401
