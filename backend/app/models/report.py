"""Frågeformulär och veckoredovisningar (B5).

- ClassForm: lärarens utkast till klassens frågor. Eleverna ser det inte.
- FormVersion: en publicerad version av frågorna. Ändras aldrig efter publicering.
- Report: en elevs redovisning för en klass och en dag. Utkast tills eleven skickar in,
  sedan låst.
- ReportAnswer: ett svar på en fråga, som typat värde.
- ReportRead: vilka lärare som har läst redovisningen.
- ReportComment: kommentarer på en inskickad redovisning.
"""

import uuid
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.project import Project
from app.models.school_class import SchoolClass
from app.models.user import User


class ClassForm(Base):
    """Utkastet till klassens frågor. Finns bara när läraren har börjat ändra."""

    __tablename__ = "class_forms"

    class_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("school_classes.id", ondelete="CASCADE"), primary_key=True
    )
    # Frågorna i samma format som FormContent.questions.
    draft: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )


class FormVersion(Base):
    """En publicerad version av klassens frågor. Version 1, 2, 3 … per klass."""

    __tablename__ = "form_versions"
    __table_args__ = (UniqueConstraint("class_id", "version"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    class_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("school_classes.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    questions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    published_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )


class ReportStatus(StrEnum):
    DRAFT = "draft"  # eleven svarar, bara eleven ser den
    SUBMITTED = "submitted"  # inskickad och låst


class CommentVisibility(StrEnum):
    ALL = "all"  # eleven, lärarna och handledaren
    STAFF = "staff"  # bara lärarna och handledaren (Texas, 2026-10-30)


class Report(Base):
    """En elevs redovisning för en klass och en redovisningsdag."""

    __tablename__ = "reports"
    __table_args__ = (
        UniqueConstraint("student_id", "class_id", "due_date"),
        CheckConstraint("status IN ('draft', 'submitted')", name="status_valid"),
        CheckConstraint(
            "(status = 'submitted') = (submitted_at IS NOT NULL)", name="submitted_at_matches"
        ),
        # Lärarens lista: klassens inskickade redovisningar, senaste först.
        Index(
            "ix_reports_class_submitted",
            "class_id",
            "submitted_at",
            postgresql_where=text("status = 'submitted'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    class_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("school_classes.id", ondelete="RESTRICT"), index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    # Versionen eleven svarar på. Låses när redovisningen startas.
    form_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("form_versions.id", ondelete="RESTRICT")
    )
    due_date: Mapped[date] = mapped_column(Date)
    # Projektet redovisningen gäller (B12). Valfritt. Tas projektet bort blir fältet tomt.
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[ReportStatus] = mapped_column(String(20), default=ReportStatus.DRAFT)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    school_class: Mapped[SchoolClass] = relationship()
    student: Mapped[User] = relationship()
    form_version: Mapped[FormVersion] = relationship()
    project: Mapped[Project | None] = relationship()
    answers: Mapped[list["ReportAnswer"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )
    comments: Mapped[list["ReportComment"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="ReportComment.created_at"
    )


class ReportAnswer(Base):
    """Ett svar som typat värde. Vilken kolumn som används beror på frågetypen."""

    __tablename__ = "report_answers"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="rating_range"),
        # Ett svar har ett värde: text, flerval (med eller utan Annat), ja/nej eller betyg.
        CheckConstraint(
            "num_nonnulls(text, boolean, rating, coalesce(choice_ids::text, other_text)) = 1",
            name="one_value",
        ),
    )

    report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True
    )
    # Frågans fasta id i formuläret (FormVersion.questions).
    question_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    text: Mapped[str | None] = mapped_column(Text)
    choice_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(Uuid))
    other_text: Mapped[str | None] = mapped_column(Text)
    boolean: Mapped[bool | None] = mapped_column(Boolean)
    rating: Mapped[int | None] = mapped_column(SmallInteger)
    answered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ReportRead(Base):
    """Att en lärare har läst redovisningen."""

    __tablename__ = "report_reads"

    report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReportComment(Base):
    """En kommentar på en inskickad redovisning, från eleven, en lärare eller handledaren.

    Lärare och handledare kan skriva privat (`STAFF`). Eleven ser då inte kommentaren. Eleven
    kan ändå begära ut den enligt GDPR, och på kommunala skolor kan den vara en allmän handling.
    """

    __tablename__ = "report_comments"
    __table_args__ = (CheckConstraint("visibility IN ('all', 'staff')", name="visibility_values"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("reports.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    body: Mapped[str] = mapped_column(Text)
    visibility: Mapped[CommentVisibility] = mapped_column(
        String(10), default=CommentVisibility.ALL, server_default=CommentVisibility.ALL.value
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    author: Mapped[User] = relationship()
