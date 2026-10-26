import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User

# Vilka handledare som finns på arbetsplatsen. En handledare kan finnas på flera
# arbetsplatser, även på olika skolor, eftersom handledaren inte hör till någon skola.
workplace_supervisors = Table(
    "workplace_supervisors",
    Base.metadata,
    Column("workplace_id", ForeignKey("workplaces.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "supervisor_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    ),
)


class Workplace(Base):
    """En APL-plats, t.ex. ett företag. Hör till en skola.

    Handledaren skapar företagsprofilen när hen tackar ja till lärarens inbjudan. Företaget syns
    då bara för läraren som bjöd in (`owner_teacher_id`) och för skolans ledning (Texas,
    2026-10-26). Utan ägare, t.ex. om skoladmin bjöd in, syns det för skolans alla lärare.
    """

    __tablename__ = "workplaces"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("schools.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(300))
    industry: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    owner_teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    supervisors: Mapped[list[User]] = relationship(
        secondary=workplace_supervisors, order_by=User.name
    )


class Placement(Base):
    """En elevs APL-period på en arbetsplats, med en handledare.

    En elevs placeringar får inte överlappa, så att det alltid finns högst en aktiv
    placering per dag (incheckningen i B4 utgår från den).
    """

    __tablename__ = "placements"
    __table_args__ = (CheckConstraint("end_date >= start_date", name="dates_in_order"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # RESTRICT: placeringen är underlag för närvaro och ska inte försvinna med kontot.
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    workplace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workplaces.id", ondelete="RESTRICT"), index=True
    )
    supervisor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    student: Mapped[User] = relationship(foreign_keys=[student_id])
    workplace: Mapped[Workplace] = relationship()
    supervisor: Mapped[User] = relationship(foreign_keys=[supervisor_id])
