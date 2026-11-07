"""Inloggningsskydd och logg (B6).

PasswordReset: en engångslänk för Glömt lösenord. Bara hashen av token sparas, som för
sessioner och inbjudningar.

RateLimitEvent: misslyckade inloggningar och begäranden om nytt lösenord, för att begränsa
antalet försök per e-post och IP. E-posten sparas bara som hash. Raderna behövs bara under
spärrtiden och städas bort efter ett dygn.

AuditEvent: loggen över inloggningar och ändringar. Den sparar vem som gjorde vad (id:n),
vilken tabell och rad som ändrades och vilka fält, men aldrig namn, e-post eller värden.
`actor_id` har ingen främmande nyckel, så att loggen finns kvar om kontot tas bort.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship()


class RateLimitEvent(Base):
    __tablename__ = "rate_limit_events"
    __table_args__ = (
        Index("ix_rate_limit_events_email", "kind", "email_hash", "created_at"),
        Index("ix_rate_limit_events_ip", "kind", "ip", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # "login" (misslyckad inloggning) eller "password_reset" (begäran om nytt lösenord).
    kind: Mapped[str] = mapped_column(String(20))
    email_hash: Mapped[str] = mapped_column(String(64))
    ip: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    # T.ex. "auth.login", "auth.login_failed", "insert", "update", "delete".
    action: Mapped[str] = mapped_column(String(40))
    # Tabellen som ändrades, t.ex. "placements".
    entity: Mapped[str | None] = mapped_column(String(60))
    # Radens id. Saknas när en ändring gäller flera rader på en gång.
    entity_id: Mapped[str | None] = mapped_column(String(100), index=True)
    # Fälten som ändrades, utan värden.
    fields: Mapped[list[str] | None] = mapped_column(ARRAY(String(60)))
