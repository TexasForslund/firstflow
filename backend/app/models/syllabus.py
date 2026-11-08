"""Läroplanen från Skolverket och klassens ämnen (idé 13, Texas 2026-11-08).

Firstflow sparar svaren från Skolverkets Syllabus API själv, så att inte varje sida frågar
Skolverket. Klassen får en läroplan (Gy25 eller Gy11), ett program, en inriktning och de ämnen
och nivåer (Gy25) eller kurser (Gy11) som eleverna tränar under APL.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SyllabusCache(Base):
    """Ett sparat svar från Skolverket. `kind` är till exempel "programs" eller "program"."""

    __tablename__ = "syllabus_cache"

    kind: Mapped[str] = mapped_column(String(20), primary_key=True)
    code: Mapped[str] = mapped_column(String(30), primary_key=True)
    data: Mapped[dict] = mapped_column(JSONB)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClassSubject(Base):
    """Ett ämne på en nivå (Gy25) eller en kurs (Gy11) som klassen tränar under APL.

    Namnen sparas här, så att klassens ämnen syns även om Skolverket inte svarar.
    """

    __tablename__ = "class_subjects"
    __table_args__ = (CheckConstraint("points IS NULL OR points > 0", name="points_positive"),)

    class_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("school_classes.id", ondelete="CASCADE"), primary_key=True
    )
    # Nivåns eller kursens kod hos Skolverket, till exempel ELTE1000X eller ELRELK0.
    level_code: Mapped[str] = mapped_column(String(20), primary_key=True)
    subject_code: Mapped[str] = mapped_column(String(10))
    subject_name: Mapped[str] = mapped_column(String(200))
    level_name: Mapped[str] = mapped_column(String(200))
    points: Mapped[int | None] = mapped_column(SmallInteger)
