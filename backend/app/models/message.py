import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, Text, func
from sqlalchemy.orm import Mapped, deferred, mapped_column, relationship

from app.db.base import Base
from app.models.user import User


class Conversation(Base):
    """Ett samtal i Meddelanden (B11, Texas 2026-11-02).

    Två och två eller en grupp. Gruppen för en praktikplats skapas automatiskt med eleven,
    handledaren och elevens lärare (`placement_id`).
    """

    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Gruppens namn. Tomt: namnen på de andra i samtalet visas.
    name: Mapped[str | None] = mapped_column(String(120))
    is_group: Mapped[bool] = mapped_column(Boolean, default=False)
    placement_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("placements.id", ondelete="SET NULL"), unique=True
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    members: Mapped[list["ConversationMember"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class ConversationMember(Base):
    __tablename__ = "conversation_members"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    # Senast personen läste samtalet. Meddelanden efter det är olästa.
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Satt när ett mejl om olästa meddelanden har skickats. Nollas när personen läser, så att
    # det blir högst ett mejl per samtal tills det är läst.
    emailed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    conversation: Mapped[Conversation] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    sender_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    text: Mapped[str | None] = mapped_column(Text)
    # Ett delat projekt, som visas som ett kort.
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    sender: Mapped[User | None] = relationship()
    attachments: Mapped[list["MessageAttachment"]] = relationship(
        cascade="all, delete-orphan", order_by="MessageAttachment.position"
    )


class MessageAttachment(Base):
    """En bild eller fil i ett meddelande, högst 10 MB.

    Sparas i databasen, som kontraktens PDF:er.
    """

    __tablename__ = "message_attachments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    is_image: Mapped[bool] = mapped_column(Boolean, default=False)
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary, nullable=False))
