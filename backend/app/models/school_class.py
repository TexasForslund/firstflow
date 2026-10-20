import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    Table,
    UniqueConstraint,
    func,
    true,
)
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
        CheckConstraint("apl_end_date >= apl_start_date", name="apl_period_order"),
        CheckConstraint("apl_days_per_week BETWEEN 1 AND 5", name="apl_days_per_week_range"),
        CheckConstraint(
            "attendance_min_percent BETWEEN 0 AND 100", name="attendance_min_percent_range"
        ),
        CheckConstraint("report_due_weekday BETWEEN 0 AND 6", name="report_due_weekday_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("schools.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # APL-villkor för hela klassen. Tomt betyder att det inte är bestämt än.
    apl_start_date: Mapped[date | None] = mapped_column(Date)
    apl_end_date: Mapped[date | None] = mapped_column(Date)
    apl_days_per_week: Mapped[int | None] = mapped_column(SmallInteger)
    check_in_required: Mapped[bool] = mapped_column(default=True, server_default=true())
    # Lägsta närvaro i procent innan eleven hamnar under "Behöver uppmärksamhet".
    attendance_min_percent: Mapped[int | None] = mapped_column(SmallInteger)
    # Veckodag då veckoredovisningen ska vara inlämnad: 0 = måndag … 6 = söndag.
    report_due_weekday: Mapped[int | None] = mapped_column(SmallInteger)

    school: Mapped[School] = relationship()
    teachers: Mapped[list[User]] = relationship(secondary=class_teachers, order_by=User.name)
    students: Mapped[list[User]] = relationship(secondary=class_students, order_by=User.name)
