# Samlar alla modeller så att Alembic hittar dem vid autogenerate.
from app.db.base import Base  # noqa: F401
from app.models.attendance import Attendance  # noqa: F401
from app.models.invitation import Invitation, Notification  # noqa: F401
from app.models.placement import (  # noqa: F401
    Placement,
    Workplace,
    workplace_supervisors,
)
from app.models.project import Project, project_students  # noqa: F401
from app.models.report import (  # noqa: F401
    ClassForm,
    FormVersion,
    Report,
    ReportAnswer,
    ReportComment,
    ReportRead,
)
from app.models.school import School  # noqa: F401
from app.models.school_class import (  # noqa: F401
    SchoolClass,
    class_students,
    class_teachers,
    teacher_students,
)
from app.models.template import QuestionTemplate  # noqa: F401
from app.models.user import User, UserSession  # noqa: F401
