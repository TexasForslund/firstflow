import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func, text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.school import School


class UserRole(StrEnum):
    """Roller i Firstflow. Se docs/multi-tenant-och-roller.md."""

    SUPERADMIN = "superadmin"  # Firstflow-teamet. Skapar skolor och skoladmins.
    SCHOOL_ADMIN = "school_admin"  # Administrerar sin skola.
    PRINCIPAL = "principal"  # Rektor.
    SYV = "syv"  # Studie- och yrkesvägledare.
    TEACHER = "teacher"
    STUDENT = "student"
    SUPERVISOR = "supervisor"  # Handledare på arbetsplatsen. Tillhör ingen skola.


# Roller som inte hör till någon skola. Alla andra roller måste ha school_id.
ROLES_WITHOUT_SCHOOL = frozenset({UserRole.SUPERADMIN, UserRole.SUPERVISOR})

# Samma regel som i ROLES_WITHOUT_SCHOOL, som villkor i databasen.
# role::text används eftersom nya enum-värden inte får jämföras i samma transaktion som de skapas.
SCHOOL_MATCHES_ROLE_SQL = "(role::text IN ('superadmin', 'supervisor')) = (school_id IS NULL)"


class User(Base):
    """En person som loggar in i Firstflow."""

    __tablename__ = "users"
    __table_args__ = (CheckConstraint(SCHOOL_MATCHES_ROLE_SQL, name="school_matches_role"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role", values_callable=lambda e: [r.value for r in e])
    )
    school_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("schools.id", ondelete="RESTRICT"), index=True
    )
    password_hash: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(default=True)
    # Visningsinställningar som användaren själv väljer (textstorlek, kontrast m.m.).
    # Se DisplayPreferences i app/api/schemas.py. Gäller på alla enheter.
    display_preferences: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    school: Mapped[School | None] = relationship()
    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def school_name(self) -> str | None:
        return self.school.name if self.school else None


class UserSession(Base):
    """En inloggning. Cookien bär en slumpad token, databasen sparar bara dess hash."""

    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="sessions")
