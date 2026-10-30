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
    # När eleven lades i klassen. Redovisningar räknas från den dagen.
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
    # Elevens inriktning i klassen, t.ex. Dator eller Programmering. En per elev (Texas,
    # 2026-10-30). Frågor kan visas bara för vissa inriktningar.
    Column("track_id", ForeignKey("class_tracks.id", ondelete="SET NULL"), nullable=True),
    # En elev går i en klass (Texas, 2026-10-26). Läggs eleven i en ny klass flyttas hen.
    UniqueConstraint("student_id", name="uq_class_students_student_id"),
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
        CheckConstraint(
            "apl_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]", name="apl_weekdays_range"
        ),
        # Redovisningsdagarna väljs bland APL-dagarna (Texas, 2026-10-30).
        CheckConstraint("report_due_weekdays <@ apl_weekdays", name="report_due_on_apl_days"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("schools.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # APL-villkor för hela klassen. Veckodagar: 0 = måndag … 6 = söndag.
    # APL-dagar: dagarna eleverna är på APL och checkar in, även helger för t.ex.
    # vuxenutbildning (Texas, 2026-10-30). Närvaron räknar bara de dagarna.
    apl_weekdays: Mapped[list[int]] = mapped_column(
        ARRAY(SmallInteger), default=lambda: [0, 1, 2, 3, 4], server_default=text("'{0,1,2,3,4}'")
    )
    check_in_required: Mapped[bool] = mapped_column(default=True, server_default=true())
    # Dagar då redovisning ska lämnas, bland APL-dagarna. Tom lista = inte bestämt.
    report_due_weekdays: Mapped[list[int]] = mapped_column(
        ARRAY(SmallInteger), default=list, server_default=text("'{}'")
    )

    school: Mapped[School] = relationship()
    teachers: Mapped[list[User]] = relationship(secondary=class_teachers, order_by=User.name)
    students: Mapped[list[User]] = relationship(secondary=class_students, order_by=User.name)


class ClassTrack(Base):
    """En inriktning i klassen, t.ex. Dator eller Programmering (Texas, 2026-10-30).

    Läraren delar in eleverna i inriktningar och kan visa vissa frågor bara för en eller flera
    av dem. Eleverna sätts i `class_students.track_id`.
    """

    __tablename__ = "class_tracks"
    __table_args__ = (UniqueConstraint("class_id", "name"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    class_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("school_classes.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
