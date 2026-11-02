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

# Vilka handledare som finns på arbetsplatsen. En handledare hör till ett enda företag
# (Texas, 2026-11-02), men företaget kan ta emot elever från flera skolor.
workplace_supervisors = Table(
    "workplace_supervisors",
    Base.metadata,
    Column("workplace_id", ForeignKey("workplaces.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "supervisor_id",
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        unique=True,
    ),
)


class WorkplaceSchool(Base):
    """Att en skola har elever på företaget (Texas, 2026-11-02).

    Företagsprofilen delas mellan skolorna, men varje skola ser bara sina egna elever,
    placeringar, kontrakt och projekt. På varje skola syns företaget bara för läraren som bjöd
    in (`owner_teacher_id`) och för skolans ledning. Utan ägare, t.ex. om skoladmin bjöd in,
    syns det för skolans alla lärare.
    """

    __tablename__ = "workplace_schools"

    workplace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workplaces.id", ondelete="CASCADE"), primary_key=True
    )
    school_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("schools.id", ondelete="RESTRICT"), primary_key=True, index=True
    )
    owner_teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Workplace(Base):
    """En APL-plats, t.ex. ett företag, med en företagsprofil som delas mellan skolorna.

    Handledaren skapar företagsprofilen när hen tackar ja till lärarens inbjudan. Bjuder en
    annan skola in en handledare som redan har ett företag, läggs skolan till i `school_links`.
    """

    __tablename__ = "workplaces"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(300))
    industry: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    supervisors: Mapped[list[User]] = relationship(
        secondary=workplace_supervisors, order_by=User.name
    )
    school_links: Mapped[list[WorkplaceSchool]] = relationship(
        cascade="all, delete-orphan", order_by=WorkplaceSchool.created_at
    )

    def __init__(
        self,
        *,
        school_id: uuid.UUID | None = None,
        owner_teacher_id: uuid.UUID | None = None,
        **kwargs: object,
    ) -> None:
        """`school_id` kopplar företaget till en första skola."""
        super().__init__(**kwargs)
        if school_id is not None:
            self.school_links.append(
                WorkplaceSchool(school_id=school_id, owner_teacher_id=owner_teacher_id)
            )

    def link(self, school_id: uuid.UUID) -> WorkplaceSchool | None:
        """Kopplingen till skolan, eller None om skolan inte har elever här."""
        return next((s for s in self.school_links if s.school_id == school_id), None)


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
