"""Inbjudningar och notiser.

Invitation: en inbjudan via e-post med en engångslänk. Länken bär en slumpad token, och
databasen sparar bara dess hash, som för inloggningen. Ingen e-post eller id står i klartext
i länken.
- `supervisor`: läraren bjuder in en handledare, som skapar konto och företagsprofil.
- `colleague`: en handledare bjuder in en kollega till sin arbetsplats (högst tre).

Notification: en notis till en användare, t.ex. att en handledare har skapat sin
företagsprofil.
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.placement import Workplace
from app.models.school import School
from app.models.user import User


class InvitationKind(StrEnum):
    SUPERVISOR = "supervisor"  # från lärare eller skoladmin, med ny företagsprofil
    COLLEAGUE = "colleague"  # från handledare, till en befintlig arbetsplats


class Invitation(Base):
    __tablename__ = "invitations"
    __table_args__ = (
        CheckConstraint("kind IN ('supervisor', 'colleague')", name="kind_valid"),
        # En kollega bjuds in till en arbetsplats. En ny handledare skapar sin egen.
        CheckConstraint(
            "(kind = 'colleague') = (workplace_id IS NOT NULL)", name="workplace_matches_kind"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    kind: Mapped[InvitationKind] = mapped_column(String(20))
    email: Mapped[str] = mapped_column(String(320), index=True)
    school_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), index=True
    )
    invited_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    workplace_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workplaces.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    school: Mapped[School] = relationship()
    invited_by: Mapped[User] = relationship(foreign_keys=[invited_by_id])
    workplace: Mapped[Workplace | None] = relationship()


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    text: Mapped[str] = mapped_column(String(300))
    # Sökväg i appen, t.ex. /placements.
    link: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
