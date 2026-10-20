import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    Table,
    UniqueConstraint,
    func,
    text,
    true,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.school import School
from app.models.user import User

# Vilka lärare som har klassen.
class_teachers = Table(
    "class_teachers",
    Base.metadata,
    Column("class_id", ForeignKey("school_classes.id", ondelete="CASCADE"), primary_key=True),
    Column("teacher_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True),
)

# Vilka elever som går i klassen.
class_students = Table(
    "class_students",
    Base.metadata,
    Column("class_id", ForeignKey("school_classes.id", ondelete="CASCADE"), primary_key=True),
    Column("student_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True),
)

# Vilka elever en lärare ansvarar för. Sätts av skoladmin, oberoende av klasser.
# Läraren kan bara lägga sina egna elever i klasser.
teacher_students = Table(
    "teacher_students",
    Base.metadata,
    Column("teacher_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("student_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class SchoolClass(Base):
    """En klass, t.ex. EE22. Hör alltid till en skola. Namnet är unikt inom skolan."""

    __tablename__ = "school_classes"
    __table_args__ = (
        UniqueConstraint("school_id", "name"),
        CheckConstraint("apl_days_per_week BETWEEN 1 AND 5", name="apl_days_per_week_range"),
        CheckConstraint(
            "report_due_weekdays <@ ARRAY[0, 1, 2, 3, 4]::smallint[]",
            name="report_due_weekdays_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("schools.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # APL-villkor för hela klassen. Tomt betyder att det inte är bestämt än.
    apl_days_per_week: Mapped[int | None] = mapped_column(SmallInteger)
    check_in_required: Mapped[bool] = mapped_column(default=True, server_default=true())
    # Vardagar då veckoredovisning ska lämnas: 0 = måndag … 4 = fredag. Tom lista = inte bestämt.
    # Ingen APL på helger (Texas, 2026-10-20).
    report_due_weekdays: Mapped[list[int]] = mapped_column(
        ARRAY(SmallInteger), default=list, server_default=text("'{}'")
    )

    school: Mapped[School] = relationship()
    teachers: Mapped[list[User]] = relationship(secondary=class_teachers, order_by=User.name)
    students: Mapped[list[User]] = relationship(secondary=class_students, order_by=User.name)
