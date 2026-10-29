"""Kontrakt (B8): utbildningskontrakt för APL som parterna signerar i Firstflow.

Beslut (Texas, 2026-10-29):
- Läraren laddar upp avtalet som PDF. Firstflow fyller inte i mallar än.
- Tre parter signerar: eleven, handledaren och läraren. Läraren signerar för skolan när hen
  skickar kontraktet. Rektor och vårdnadshavare är inte med.
- Testläge: parterna signerar med en knapp. BankID kopplas in när signeringstjänsten är vald.

Contract: själva kontraktet med PDF:en. PDF:en ligger i databasen (`pdf`) och laddas bara när
den hämtas.
ContractSignature: en rad per part, med när parten öppnade och signerade avtalet.
"""

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Date, DateTime, ForeignKey, LargeBinary, String, func
from sqlalchemy.orm import Mapped, deferred, mapped_column, relationship

from app.db.base import Base
from app.models.placement import Workplace
from app.models.user import User


class SignerRole(StrEnum):
    STUDENT = "student"
    SUPERVISOR = "supervisor"
    TEACHER = "teacher"


class Contract(Base):
    __tablename__ = "contracts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("schools.id", ondelete="RESTRICT"), index=True
    )
    # Läraren som skapade kontraktet.
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    workplace_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workplaces.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    file_name: Mapped[str] = mapped_column(String(200))
    pdf: Mapped[bytes] = deferred(mapped_column(LargeBinary))
    pdf_size: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Satt när läraren har skickat kontraktet för signering. Utan värde är det ett utkast.
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id])
    student: Mapped[User] = relationship(foreign_keys=[student_id])
    workplace: Mapped[Workplace | None] = relationship()
    signatures: Mapped[list["ContractSignature"]] = relationship(
        back_populates="contract", cascade="all, delete-orphan"
    )


class ContractSignature(Base):
    __tablename__ = "contract_signatures"

    contract_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("contracts.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[SignerRole] = mapped_column(String(20), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # "test" i testläget. "bankid" när signeringstjänsten är kopplad.
    method: Mapped[str | None] = mapped_column(String(20))

    contract: Mapped[Contract] = relationship(back_populates="signatures")
    user: Mapped[User] = relationship()
