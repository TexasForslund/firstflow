"""Närvaro och incheckning (B4).

En rad per placering och dag. Eleven checkar in (närvarande). Dagar utan rad är inte
incheckade. Ingen plats (GPS) sparas, det behövs inte.

Handledaren bekräftar närvaron (Texas, 2026-10-29). `review` är handledarens svar:
- null: eleven har checkat in och dagen väntar på handledaren.
- confirmed: handledaren har bekräftat. Har dagen ingen incheckningstid glömde eleven att
  checka in och handledaren lade till dagen.
- not_present: handledaren säger att eleven inte var på plats. Har dagen en incheckningstid
  stämmer incheckningen och handledarens svar inte överens.
"""

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.placement import Placement


class AttendanceStatus(StrEnum):
    PRESENT = "present"  # incheckad
    # Frånvaroanmälan är borttagen (Texas, 2026-10-26). Värdena finns kvar i databasen men
    # sätts inte längre.
    ABSENT = "absent"
    SICK = "sick"


class AttendanceReview(StrEnum):
    CONFIRMED = "confirmed"
    NOT_PRESENT = "not_present"


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint("placement_id", "date"),
        CheckConstraint("status IN ('present', 'absent', 'sick')", name="status_valid"),
        # Bara en incheckning har en tid. En dag som handledaren lade till är närvarande
        # utan tid.
        CheckConstraint(
            "checked_in_at IS NULL OR status = 'present'", name="checked_in_at_matches"
        ),
        CheckConstraint(
            "review IS NULL OR review IN ('confirmed', 'not_present')", name="review_valid"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # RESTRICT: närvaron är underlag för skolan och ska inte försvinna med placeringen.
    placement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("placements.id", ondelete="RESTRICT"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    status: Mapped[AttendanceStatus] = mapped_column(String(20))
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(300))
    review: Mapped[AttendanceReview | None] = mapped_column(String(20))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    placement: Mapped[Placement] = relationship()
