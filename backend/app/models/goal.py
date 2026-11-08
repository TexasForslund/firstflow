"""Mål från läroplanen (idé 10, Texas 2026-10-30).

Ett mål, t.ex. Kundkontakt, är en gemensam rubrik på skolan som kan pekas mot en del av
läroplanen. Projekt har mål, och läraren kopplar svar på frågor till mål (t.ex. Ja på "Har du
haft kundkontakt i dag?"). Elevens svar blir då underlag för målet.

Två sorters mål (idé 13, steg 2, Texas 2026-11-08):
- **Skolans mål** (`class_id` saknas), till exempel Kundkontakt. Läroplanen kan skrivas in som
  text i `curriculum`. Projekten använder dem.
- **Klassens mål från läroplanen.** Läraren väljer en punkt i det centrala innehållet för ett av
  klassens ämnen och ger den ett kort namn. Målet sparar texten som den var när målet skapades,
  eftersom läroplanen kan få nya versioner.
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
    # Samma namn bara en gång bland skolans mål och en gång i varje klass, oavsett stora och
    # små bokstäver.
    __table_args__ = (
        Index(
            "uq_goals_school_id_class_id_name",
            "school_id",
            "class_id",
            func.lower("name"),
            unique=True,
            postgresql_nulls_not_distinct=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), index=True
    )
    class_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("school_classes.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(40))
    # Klassens mål: ämnet och nivån eller kursen, och punkten i det centrala innehållet.
    subject_name: Mapped[str | None] = mapped_column(String(200))
    level_code: Mapped[str | None] = mapped_column(String(20))
    level_name: Mapped[str | None] = mapped_column(String(200))
    content: Mapped[str | None] = mapped_column(Text)
    # Vilken del av läroplanen målet gäller, t.ex. "Elteknik nivå 1: Kommunikation med kund".
    curriculum: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
