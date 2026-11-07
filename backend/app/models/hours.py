"""Arbetstider för företag och praktikplatser (idé 12, Texas 2026-11-07).

Företaget har arbetstider som gäller alla elever där. En praktikplats kan ha egna tider. Har den
några egna rader gäller bara de, annars företagets. Eleven kan checka in från tio minuter innan
dagen börjar.
"""

import uuid
from datetime import time

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WorkplaceHours(Base):
    __tablename__ = "workplace_hours"
    __table_args__ = (
        CheckConstraint("weekday BETWEEN 0 AND 6", name="weekday_valid"),
        CheckConstraint("start_time < end_time", name="start_before_end"),
    )

    workplace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workplaces.id", ondelete="CASCADE"), primary_key=True
    )
    # 0 = måndag … 6 = söndag
    weekday: Mapped[int] = mapped_column(Integer, primary_key=True)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)


class PlacementHours(Base):
    """Egna tider för en elev, när de skiljer sig från företagets."""

    __tablename__ = "placement_hours"
    __table_args__ = (
        CheckConstraint("weekday BETWEEN 0 AND 6", name="weekday_valid"),
        CheckConstraint("start_time < end_time", name="start_before_end"),
    )

    placement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("placements.id", ondelete="CASCADE"), primary_key=True
    )
    weekday: Mapped[int] = mapped_column(Integer, primary_key=True)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
