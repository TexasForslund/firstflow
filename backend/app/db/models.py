# Samlar alla modeller så att Alembic hittar dem vid autogenerate.
from app.db.base import Base  # noqa: F401
from app.models.school import School  # noqa: F401
from app.models.school_class import (  # noqa: F401
    SchoolClass,
    class_students,
    class_teachers,
    teacher_students,
)
from app.models.user import User, UserSession  # noqa: F401
