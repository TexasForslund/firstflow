import uuid
from datetime import date, datetime

from sqlalchemy import ARRAY, Column, Date, DateTime, ForeignKey, String, Table, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.placement import Workplace
from app.models.user import User

# Elever i projektet. Ett projekt kan ha flera elever och en elev flera projekt.
project_students = Table(
    "project_students",
    Base.metadata,
    Column("project_id", ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    Column("student_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True),
)

# Handledare som är inbjudna till projektet. De ändrar text, slutdatum och taggar, men inte vilka
# elever som är med (Texas, 2026-10-29).
project_supervisors = Table(
    "project_supervisors",
    Base.metadata,
    Column("project_id", ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "supervisor_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    ),
)


class Project(Base):
    """Ett projekt som eleverna arbetar med under APL, t.ex. "Elinstallation i villa" (B12).

    Läraren som skapar projektet äger det och ändrar allt. Inbjudna handledare ändrar text,
    slutdatum och taggar (Texas, 2026-10-29). Veckoredovisningar kan kopplas till ett projekt.
    """

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("schools.id", ondelete="RESTRICT"), index=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    deadline: Mapped[date | None] = mapped_column(Date)
    # Företaget projektet görs på. Valfritt.
    workplace_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workplaces.id", ondelete="SET NULL"), index=True
    )
    # Satt när projektet är avslutat.
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Fritext, t.ex. ["Elinstallation", "Mätning"].
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped[User] = relationship(foreign_keys=[owner_id])
    students: Mapped[list[User]] = relationship(secondary=project_students, order_by=User.name)
    supervisors: Mapped[list[User]] = relationship(
        secondary=project_supervisors, order_by=User.name
    )
    workplace: Mapped[Workplace | None] = relationship()
