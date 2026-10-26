"""Frågemallar (B5b).

En mall är en sparad uppsättning frågor som läraren kan använda i en klass. Mallen kopieras
till klassens utkast, så en ändrad eller borttagen mall påverkar inte klasser som redan har
använt den.

- Skolans mallar (`owner_id` null) skapas av skoladmin och syns för alla lärare på skolan.
- Lärarens egna mallar (`owner_id` satt) syns bara för läraren.

Se docs/design/fragor-typeform.md.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User


class QuestionTemplate(Base):
    __tablename__ = "question_templates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), index=True
    )
    # Null betyder att mallen är skolans. Annars lärarens egen.
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    # Frågorna i samma format som FormContent.questions.
    questions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])
