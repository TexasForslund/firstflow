"""Mål från läroplanen (idé 10, Texas 2026-10-30).

Ett mål, t.ex. Kundkontakt, är en gemensam rubrik på skolan som kan pekas mot en del av
läroplanen. Projekt har mål, och läraren kopplar svar på frågor till mål (t.ex. Ja på "Har du
haft kundkontakt i dag?"). Elevens svar blir då underlag för målet. Steg ett: läroplanen skrivs
in som text. Steg två: välj från Skolverkets API.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Table, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Projektets mål. Ersätter projektets fritexttaggar.
project_goals = Table(
    "project_goals",
    Base.metadata,
    Column("project_id", ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    Column("goal_id", ForeignKey("goals.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class Goal(Base):
    __tablename__ = "goals"
    # Samma mål ska inte finnas två gånger på skolan, oavsett stora och små bokstäver.
    __table_args__ = (
        Index("uq_goals_school_id_name", "school_id", func.lower("name"), unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(40))
    # Vilken del av läroplanen målet gäller, t.ex. "Elteknik nivå 1: Kommunikation med kund".
    curriculum: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
