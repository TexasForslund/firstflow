import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, deferred, mapped_column, relationship

from app.db.base import Base
from app.models.goal import Goal, project_goals
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped[User] = relationship(foreign_keys=[owner_id])
    students: Mapped[list[User]] = relationship(secondary=project_students, order_by=User.name)
    supervisors: Mapped[list[User]] = relationship(
        secondary=project_supervisors, order_by=User.name
    )
    workplace: Mapped[Workplace | None] = relationship()
    # Projektets mål (idé 10). Visas som projektets taggar.
    goals: Mapped[list[Goal]] = relationship(secondary=project_goals, order_by=Goal.name)


class ProjectComment(Base):
    """En kommentar om en elevs arbete i ett projekt, från läraren eller handledaren (Texas,
    2026-11-07). Kan skrivas under hela projektet. Synlig för eleven eller bara för lärare och
    handledare, som kommentarer på redovisningar."""

    __tablename__ = "project_comments"
    __table_args__ = (
        CheckConstraint("visibility IN ('all', 'staff')", name="visibility_values"),
        Index("ix_project_comments_project_id_student_id", "project_id", "student_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    body: Mapped[str] = mapped_column(Text)
    # "all": eleven ser den också. "staff": bara lärare och handledare.
    visibility: Mapped[str] = mapped_column(String(10), default="all", server_default="all")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    author: Mapped[User] = relationship(foreign_keys=[author_id])


# Målen eleven tycker att den visade i projektet (idé 12:6, steg 2).
project_summary_goals = Table(
    "project_summary_goals",
    Base.metadata,
    Column("summary_id", ForeignKey("project_summaries.id", ondelete="CASCADE"), primary_key=True),
    Column("goal_id", ForeignKey("goals.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class ProjectSummary(Base):
    """Elevens sammanfattning när projektet är klart (idé 12:6 steg 2, Texas 2026-11-07 och
    2026-11-08). Fyra korta frågor: hur det gick (1–5 stjärnor), vad eleven är mest nöjd med (en
    mening), vilka av projektets mål eleven tycker att den visade och bilder (valfritt). Frivilligt.
    I ett grupprojekt svarar varje elev själv."""

    __tablename__ = "project_summaries"
    __table_args__ = (
        UniqueConstraint("project_id", "student_id"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="rating_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    rating: Mapped[int] = mapped_column(SmallInteger)
    best: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    goals: Mapped[list[Goal]] = relationship(secondary=project_summary_goals)
    images: Mapped[list["ProjectSummaryImage"]] = relationship(
        order_by="ProjectSummaryImage.created_at", viewonly=True
    )


class ProjectSummaryImage(Base):
    """En bild på slutresultatet, högst 4 per elev. Komprimerad som redovisningarnas bilder
    (WebP, längsta sidan 1600 px, utan platsdata). Bilden laddas upp innan sammanfattningen
    skickas och hör till den först då (`summary_id`). Bilder som inte används tas bort."""

    __tablename__ = "project_summary_images"
    __table_args__ = (
        Index("ix_project_summary_images_project_id_student_id", "project_id", "student_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    summary_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project_summaries.id", ondelete="CASCADE"), index=True
    )
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    size: Mapped[int] = mapped_column(Integer)
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary, nullable=False))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProjectSummaryReminder(Base):
    """När eleven fick påminnelsen om att sammanfatta projektet. En påminnelse, tre dagar efter
    att projektet blev klart (Texas 2026-11-08)."""

    __tablename__ = "project_summary_reminders"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    reminded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
