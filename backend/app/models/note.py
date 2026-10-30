"""Anteckningar om eleven (B18): handledaren skriver om hur det går för eleven i helhet.

Beslut (Texas, 2026-10-30):
- Handledaren skriver. Läraren läser men skriver inte. Eleven ser inte anteckningarna.
- Varje anteckning har en tagg: Beröm, Oro eller Övrigt.
- Handledaren kan ändra och ta bort sina egna anteckningar i 24 timmar.

Anteckningarna är integritetskänsliga. Eleven kan begära ut dem enligt GDPR, och på kommunala
skolor kan de vara allmänna handlingar. Logga aldrig innehållet.
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User


class NoteTag(StrEnum):
    PRAISE = "praise"  # Beröm
    CONCERN = "concern"  # Oro
    OTHER = "other"  # Övrigt


class StudentNote(Base):
    """En handledares anteckning om en elev."""

    __tablename__ = "student_notes"
    __table_args__ = (CheckConstraint("tag IN ('praise', 'concern', 'other')", name="tag_values"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Anteckningarna försvinner med elevens konto, så att de inte blir kvar längre än eleven.
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    tag: Mapped[NoteTag] = mapped_column(String(10))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    author: Mapped[User] = relationship(foreign_keys=[author_id])
