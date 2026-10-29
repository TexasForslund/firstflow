"""Kontrakt (B8): läraren laddar upp ett utbildningskontrakt som PDF och skickar det för
signering. Eleven, handledaren och läraren signerar (Texas, 2026-10-29).

Flödet:
1. Läraren skapar kontraktet: PDF, elev, företag och handledare. Det kan sparas som utkast.
2. När läraren skickar det signerar läraren för skolan. Eleven och handledaren får en notis.
3. Eleven och handledaren öppnar PDF:en och signerar, i valfri ordning.
4. När alla har signerat får läraren en notis. Alla parter kan ladda ner PDF:en.

Testläge: signeringen är en knapp. BankID kopplas in när signeringstjänsten är vald.

Behörighet:
- Läraren ser och ändrar kontrakt hen har skapat. Eleven måste vara en elev läraren får se, och
  företaget ett företag läraren får se (samma regler som elevsidan och praktikplatserna).
- Eleven och handledaren ser kontrakt där de är part, när kontraktet är skickat. Handledare
  har ingen skola, så för dem är signaturraden kopplingen.
"""

import os
from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import require_roles, require_same_school
from app.api.routes.invitations import notify
from app.api.routes.placements import _get_workplace
from app.api.routes.students import get_student_for
from app.core import time
from app.db.session import DbSession
from app.models.contract import Contract, ContractSignature, SignerRole
from app.models.user import User, UserRole

router = APIRouter(prefix="/contracts", tags=["contracts"])

Teacher = Annotated[User, Depends(require_roles(UserRole.TEACHER))]
Party = Annotated[
    User, Depends(require_roles(UserRole.TEACHER, UserRole.SUPERVISOR, UserRole.STUDENT))
]

MAX_PDF_BYTES = 10 * 1024 * 1024
# Ordningen parterna visas i.
ROLE_ORDER = [SignerRole.STUDENT, SignerRole.SUPERVISOR, SignerRole.TEACHER]


class Person(BaseModel):
    id: UUID
    name: str
    email: str


class Ref(BaseModel):
    id: UUID
    name: str


class Signer(BaseModel):
    role: SignerRole
    person: Person
    opened_at: datetime | None
    signed_at: datetime | None


ContractStatus = Literal["draft", "waiting", "signed"]


class ContractSummary(BaseModel):
    id: UUID
    title: str
    status: ContractStatus = Field(
        description="draft = utkast, waiting = väntar på signering, signed = alla har signerat"
    )
    student: Person
    workplace: Ref | None
    signers: list[Signer] = Field(description="Parterna i ordningen elev, handledare, lärare")
    created_at: datetime
    sent_at: datetime | None
    my_role: SignerRole | None = Field(description="Din roll i kontraktet")
    my_turn: bool = Field(description="Om kontraktet väntar på din signatur")


class ContractDetail(ContractSummary):
    start_date: date | None
    end_date: date | None
    file_name: str
    pdf_size: int
    created_by: Ref
    is_owner: bool


class SignBody(BaseModel):
    confirm: Literal[True] = Field(description="Parten har läst avtalet och godkänner det")


class Reminded(BaseModel):
    reminded: int = Field(description="Antal parter som fick en påminnelse")


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


_LOAD = (
    selectinload(Contract.student),
    selectinload(Contract.workplace),
    selectinload(Contract.created_by),
    selectinload(Contract.signatures).selectinload(ContractSignature.user),
)


def _status(contract: Contract) -> ContractStatus:
    if contract.sent_at is None:
        return "draft"
    if all(s.signed_at is not None for s in contract.signatures):
        return "signed"
    return "waiting"


def _person(user: User) -> Person:
    return Person(id=user.id, name=user.name, email=user.email)


def _my_signature(contract: Contract, user: User) -> ContractSignature | None:
    return next((s for s in contract.signatures if s.user_id == user.id), None)


def _summary_fields(contract: Contract, user: User) -> dict:
    mine = _my_signature(contract, user)
    signers = sorted(contract.signatures, key=lambda s: ROLE_ORDER.index(s.role))
    return {
        "id": contract.id,
        "title": contract.title,
        "status": _status(contract),
        "student": _person(contract.student),
        "workplace": (
            Ref(id=contract.workplace.id, name=contract.workplace.name)
            if contract.workplace
            else None
        ),
        "signers": [
            Signer(
                role=s.role, person=_person(s.user), opened_at=s.opened_at, signed_at=s.signed_at
            )
            for s in signers
        ],
        "created_at": contract.created_at,
        "sent_at": contract.sent_at,
        "my_role": mine.role if mine else None,
        "my_turn": bool(mine and contract.sent_at and mine.signed_at is None),
    }


def _detail(contract: Contract, user: User) -> ContractDetail:
    return ContractDetail(
        **_summary_fields(contract, user),
        start_date=contract.start_date,
        end_date=contract.end_date,
        file_name=contract.file_name,
        pdf_size=contract.pdf_size,
        created_by=Ref(id=contract.created_by.id, name=contract.created_by.name),
        is_owner=contract.created_by_id == user.id,
    )


def _get_contract(db: DbSession, user: User, contract_id: UUID) -> Contract:
    """Kontraktet om användaren skapade det eller är part i ett skickat kontrakt, annars 404."""
    contract = db.scalar(select(Contract).where(Contract.id == contract_id).options(*_LOAD))
    if contract is None:
        raise _not_found()
    if user.role == UserRole.TEACHER and contract.created_by_id == user.id:
        require_same_school(user, contract.school_id)
        return contract
    mine = _my_signature(contract, user)
    if mine is not None and contract.sent_at is not None:
        if user.role == UserRole.STUDENT:
            require_same_school(user, contract.school_id)
        return contract
    raise _not_found()


def _own_contract(db: DbSession, user: User, contract_id: UUID) -> Contract:
    contract = _get_contract(db, user, contract_id)
    if contract.created_by_id != user.id:
        raise _not_found()
    return contract


def _send(db: DbSession, user: User, contract: Contract) -> None:
    """Skickar kontraktet. Läraren signerar för skolan, eleven och handledaren får en notis."""
    now = time.now()
    contract.sent_at = now
    for signature in contract.signatures:
        if signature.role == SignerRole.TEACHER:
            signature.opened_at = signature.opened_at or now
            signature.signed_at = now
            signature.method = "test"
        else:
            notify(
                db,
                signature.user_id,
                f"{user.name} har skickat ett kontrakt att signera: {contract.title}",
                f"/contracts/{contract.id}",
            )


@router.get("", response_model=list[ContractSummary])
def list_contracts(db: DbSession, user: Party) -> list[ContractSummary]:
    """Lärarens kontrakt, eller de skickade kontrakt där eleven eller handledaren är part.
    Senast skapade först."""
    query = select(Contract).options(*_LOAD).order_by(Contract.created_at.desc())
    if user.role == UserRole.TEACHER:
        query = query.where(Contract.created_by_id == user.id, Contract.school_id == user.school_id)
    else:
        query = query.join(ContractSignature).where(
            ContractSignature.user_id == user.id, Contract.sent_at.is_not(None)
        )
    return [ContractSummary(**_summary_fields(c, user)) for c in db.scalars(query).unique()]


@router.post("", response_model=ContractDetail, status_code=status.HTTP_201_CREATED)
def create_contract(
    db: DbSession,
    user: Teacher,
    file: Annotated[UploadFile, File(description="Avtalet som PDF, högst 10 MB")],
    title: Annotated[
        str, Form(), StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
    ],
    student_id: Annotated[UUID, Form()],
    workplace_id: Annotated[UUID, Form()],
    supervisor_id: Annotated[UUID, Form()],
    start_date: Annotated[date | None, Form()] = None,
    end_date: Annotated[date | None, Form()] = None,
    send: Annotated[bool, Form(description="Skicka direkt, annars sparas ett utkast")] = False,
) -> ContractDetail:
    if user.school_id is None:
        raise _not_found()
    student = get_student_for(db, user, student_id)
    workplace = _get_workplace(db, user, workplace_id)
    supervisor = next((s for s in workplace.supervisors if s.id == supervisor_id), None)
    if supervisor is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Handledaren måste höra till företaget",
        )
    if start_date and end_date and end_date < start_date:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Slutdatum är före startdatum"
        )
    pdf = file.file.read(MAX_PDF_BYTES + 1)
    if len(pdf) > MAX_PDF_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail="PDF:en är större än 10 MB")
    if not pdf.startswith(b"%PDF-"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Filen måste vara en PDF")
    file_name = os.path.basename(file.filename or "").strip()[:200] or "kontrakt.pdf"

    contract = Contract(
        school_id=user.school_id,
        created_by=user,
        student=student,
        workplace=workplace,
        title=title,
        start_date=start_date,
        end_date=end_date,
        file_name=file_name,
        pdf=pdf,
        pdf_size=len(pdf),
        signatures=[
            ContractSignature(role=SignerRole.STUDENT, user=student),
            ContractSignature(role=SignerRole.SUPERVISOR, user=supervisor),
            ContractSignature(role=SignerRole.TEACHER, user=user),
        ],
    )
    db.add(contract)
    db.flush()
    if send:
        _send(db, user, contract)
    db.commit()
    return _detail(_get_contract(db, user, contract.id), user)


@router.get("/{contract_id}", response_model=ContractDetail)
def get_contract(contract_id: UUID, db: DbSession, user: Party) -> ContractDetail:
    return _detail(_get_contract(db, user, contract_id), user)


@router.get(
    "/{contract_id}/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def get_pdf(contract_id: UUID, db: DbSession, user: Party, download: bool = False) -> Response:
    """PDF:en. Första gången en part hämtar den räknas avtalet som öppnat."""
    contract = _get_contract(db, user, contract_id)
    mine = _my_signature(contract, user)
    if mine is not None and contract.sent_at is not None and mine.opened_at is None:
        mine.opened_at = time.now()
        db.commit()
    disposition = "attachment" if download else "inline"
    # Filnamnet i headern hålls till ASCII, så att headern alltid går att skicka.
    ascii_name = contract.file_name.encode("ascii", "ignore").decode() or "kontrakt.pdf"
    ascii_name = ascii_name.replace('"', "")
    return Response(
        content=contract.pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'{disposition}; filename="{ascii_name}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/{contract_id}/send", response_model=ContractDetail)
def send_contract(contract_id: UUID, db: DbSession, user: Teacher) -> ContractDetail:
    """Skickar ett utkast för signering. Läraren signerar för skolan."""
    contract = _own_contract(db, user, contract_id)
    if contract.sent_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Kontraktet är redan skickat")
    _send(db, user, contract)
    db.commit()
    return _detail(contract, user)


@router.post("/{contract_id}/sign", response_model=ContractDetail)
def sign_contract(contract_id: UUID, body: SignBody, db: DbSession, user: Party) -> ContractDetail:
    """Parten signerar (testläge). När alla har signerat får läraren en notis."""
    contract = _get_contract(db, user, contract_id)
    mine = _my_signature(contract, user)
    if mine is None or contract.sent_at is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Du är inte part i kontraktet")
    if mine.signed_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Du har redan signerat")
    now = time.now()
    mine.opened_at = mine.opened_at or now
    mine.signed_at = now
    mine.method = "test"
    if all(s.signed_at is not None for s in contract.signatures):
        notify(
            db,
            contract.created_by_id,
            f"Alla har signerat kontraktet {contract.title}",
            f"/contracts/{contract.id}",
        )
    db.commit()
    return _detail(contract, user)


@router.post("/{contract_id}/remind", response_model=Reminded)
def remind(contract_id: UUID, db: DbSession, user: Teacher) -> Reminded:
    """Påminner parterna som inte har signerat."""
    contract = _own_contract(db, user, contract_id)
    if contract.sent_at is None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Kontraktet är inte skickat")
    waiting = [s for s in contract.signatures if s.signed_at is None]
    for signature in waiting:
        notify(
            db,
            signature.user_id,
            f"Påminnelse: kontraktet {contract.title} väntar på din signatur",
            f"/contracts/{contract.id}",
        )
    db.commit()
    return Reminded(reminded=len(waiting))


@router.delete("/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contract(contract_id: UUID, db: DbSession, user: Teacher) -> Response:
    """Tar bort kontraktet, så länge eleven och handledaren inte har signerat."""
    contract = _own_contract(db, user, contract_id)
    if any(s.signed_at for s in contract.signatures if s.role != SignerRole.TEACHER):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Kontraktet är signerat och kan inte tas bort",
        )
    db.delete(contract)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
