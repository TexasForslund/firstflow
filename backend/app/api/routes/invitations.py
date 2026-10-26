"""Inbjudan av handledare, företagsprofil och notiser (Texas, 2026-10-26).

Flödet:
1. Läraren (eller skoladmin) bjuder in en handledare med e-post. Ett mejl skickas med en
   engångslänk till `/invite/<token>`. Token är slumpad och bara dess hash sparas.
2. Handledaren öppnar länken, skapar sitt konto och sin företagsprofil, och blir inloggad.
3. Läraren får en notis och kan placera elever hos företaget. Företaget syns bara för läraren
   som bjöd in och för skolans ledning.
4. Handledaren kan bjuda in upp till tre kollegor till sin arbetsplats.

Länken går ut efter `INVITATION_LIFETIME_DAYS`. En ny inbjudan till samma e-post från samma
person ersätter den gamla. En ogiltig, använd, återkallad eller utgången länk svarar 404, så
att det inte går att se skillnad på dem.
"""

from datetime import datetime, timedelta
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, require_roles
from app.api.routes.auth import start_session
from app.api.schemas import MeRead, me_read
from app.core import time
from app.core.config import settings
from app.core.security import hash_password, hash_session_token, new_session_token
from app.db.session import DbSession
from app.models.invitation import Invitation, InvitationKind, Notification
from app.models.placement import Workplace, workplace_supervisors
from app.models.school import School
from app.models.user import User, UserRole
from app.services.accounts import NO_PASSWORD, AccountCreate, create_account
from app.services.email import send_email

router = APIRouter(prefix="/invitations", tags=["invitations"])
public_router = APIRouter(prefix="/invite", tags=["invitations"])
supervisor_router = APIRouter(prefix="/supervisor/workplaces", tags=["invitations"])
notification_router = APIRouter(prefix="/notifications", tags=["notifications"])

CanInvite = Annotated[User, Depends(require_roles(UserRole.SCHOOL_ADMIN, UserRole.TEACHER))]
Supervisor = Annotated[User, Depends(require_roles(UserRole.SUPERVISOR))]

MAX_COLLEAGUES = 3
PASSWORD_MIN = 10


# --- Modeller -----------------------------------------------------------------------------


class InvitationStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"
    REVOKED = "revoked"


class Email(BaseModel):
    email: str = Field(min_length=3, max_length=320)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        return AccountCreate.valid_email(value)


class InvitationRead(BaseModel):
    id: UUID
    email: str
    status: InvitationStatus
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None
    workplace_name: str | None = Field(description="Företaget, när inbjudan är accepterad")


class InvitePreview(BaseModel):
    kind: InvitationKind
    email: str
    invited_by_name: str
    school_name: str
    workplace_name: str | None = Field(description="Arbetsplatsen när en kollega bjuds in")


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip() or None


class CompanyProfile(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=300)
    industry: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Företaget måste ha ett namn")
        return name

    @field_validator("address", "industry", "description")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        return _clean(value)


class AcceptInvite(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=PASSWORD_MIN, max_length=200)
    company: CompanyProfile | None = Field(
        default=None, description="Krävs när en ny handledare bjuds in av en lärare"
    )

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Namnet får inte vara tomt")
        return name


class Colleague(BaseModel):
    id: UUID
    name: str
    email: str


class SupervisorWorkplace(BaseModel):
    id: UUID
    name: str
    address: str | None
    industry: str | None
    description: str | None
    school_name: str
    supervisors: list[Colleague]
    pending_invitations: list[InvitationRead]
    can_invite: bool = Field(description="Färre än tre kollegor, inklusive väntande inbjudningar")


class NotificationRead(BaseModel):
    id: UUID
    text: str
    link: str | None
    created_at: datetime
    read: bool


class NotificationList(BaseModel):
    unread: int
    items: list[NotificationRead]


# --- Hjälpfunktioner ----------------------------------------------------------------------


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


def _status(invitation: Invitation) -> InvitationStatus:
    if invitation.accepted_at is not None:
        return InvitationStatus.ACCEPTED
    if invitation.revoked_at is not None:
        return InvitationStatus.REVOKED
    if invitation.expires_at <= time.now():
        return InvitationStatus.EXPIRED
    return InvitationStatus.PENDING


def _read(db: DbSession, invitation: Invitation) -> InvitationRead:
    workplace_name = None
    if invitation.accepted_user_id and invitation.kind == InvitationKind.SUPERVISOR:
        workplace_name = db.scalar(
            select(Workplace.name)
            .join(workplace_supervisors, workplace_supervisors.c.workplace_id == Workplace.id)
            .where(
                workplace_supervisors.c.supervisor_id == invitation.accepted_user_id,
                Workplace.school_id == invitation.school_id,
            )
            .order_by(Workplace.created_at.desc())
            .limit(1)
        )
    return InvitationRead(
        id=invitation.id,
        email=invitation.email,
        status=_status(invitation),
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
        accepted_at=invitation.accepted_at,
        workplace_name=workplace_name,
    )


def _check_email_free_for_supervisor(db: DbSession, email: str) -> None:
    """E-posten får inte tillhöra någon annan roll eller en handledare som redan har ett
    aktivt konto. Den senare kopplas till fler arbetsplatser senare (inte byggt än)."""
    existing = db.scalar(select(User).where(User.email == email))
    if existing is None:
        return
    if existing.role != UserRole.SUPERVISOR:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="E-postadressen används redan av någon som inte är handledare",
        )
    if existing.password_hash != NO_PASSWORD:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Handledaren har redan ett konto i Firstflow",
        )


def _send(db: DbSession, invitation: Invitation, inviter: User) -> None:
    """Skapar en ny token, sätter giltighetstiden och skickar mejlet."""
    token = new_session_token()
    invitation.token_hash = hash_session_token(token)
    invitation.expires_at = time.now() + timedelta(days=settings.invitation_lifetime_days)
    link = f"{settings.frontend_url.rstrip('/')}/invite/{token}"
    school = invitation.school.name if invitation.school else ""
    if invitation.kind == InvitationKind.COLLEAGUE and invitation.workplace:
        subject = f"{inviter.name} bjuder in dig till Firstflow"
        intro = (
            f"{inviter.name} har bjudit in dig som handledare på {invitation.workplace.name} "
            "i Firstflow, där ni följer elever på APL."
        )
    else:
        subject = "Du är inbjuden att handleda elever i Firstflow"
        intro = (
            f"{inviter.name} på {school} har bjudit in dig att handleda elever på APL "
            "(arbetsplatsförlagt lärande) i Firstflow."
        )
    body = (
        f"Hej!\n\n{intro}\n\n"
        f"Skapa ditt konto här:\n{link}\n\n"
        f"Länken gäller i {settings.invitation_lifetime_days} dagar "
        "och kan bara användas en gång.\n\n"
        "Hälsningar\nFirstflow"
    )
    send_email(invitation.email, subject, body)


def _create(
    db: DbSession,
    inviter: User,
    email: str,
    kind: InvitationKind,
    school_id: UUID,
    workplace: Workplace | None = None,
) -> Invitation:
    # En ny inbjudan till samma adress från samma person ersätter den som väntar.
    db.execute(
        update(Invitation)
        .where(
            Invitation.invited_by_id == inviter.id,
            Invitation.email == email,
            Invitation.accepted_at.is_(None),
            Invitation.revoked_at.is_(None),
        )
        .values(revoked_at=time.now())
    )
    invitation = Invitation(
        kind=kind,
        email=email,
        school_id=school_id,
        invited_by_id=inviter.id,
        workplace=workplace,
        token_hash="",
        created_at=time.now(),
        expires_at=time.now(),
    )
    db.add(invitation)
    db.flush()
    db.refresh(invitation)
    _send(db, invitation, inviter)
    db.commit()
    return invitation


def _by_token(db: DbSession, token: str) -> Invitation:
    """Inbjudan om länken går att använda, annars 404."""
    invitation = db.scalar(
        select(Invitation)
        .where(Invitation.token_hash == hash_session_token(token))
        .options(
            selectinload(Invitation.school),
            selectinload(Invitation.invited_by),
            selectinload(Invitation.workplace),
        )
    )
    if invitation is None or _status(invitation) != InvitationStatus.PENDING:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Inbjudan finns inte eller har gått ut"
        )
    return invitation


def notify(db: DbSession, user_id: UUID, text: str, link: str | None = None) -> None:
    # Tiden sätts här och inte av databasen, så att två notiser i samma transaktion
    # hamnar i rätt ordning.
    db.add(Notification(user_id=user_id, text=text, link=link, created_at=time.now()))


# --- Lärare och skoladmin -----------------------------------------------------------------


@router.post("", response_model=InvitationRead, status_code=status.HTTP_201_CREATED)
def invite_supervisor(body: Email, db: DbSession, user: CanInvite) -> InvitationRead:
    """Bjuder in en handledare. Hen skapar konto och företagsprofil via länken i mejlet."""
    _check_email_free_for_supervisor(db, body.email)
    invitation = _create(db, user, body.email, InvitationKind.SUPERVISOR, user.school_id)
    return _read(db, invitation)


@router.get("", response_model=list[InvitationRead])
def list_invitations(db: DbSession, user: CanInvite) -> list[InvitationRead]:
    """Inbjudningar som användaren har skickat, senaste först. Ersatta inbjudningar visas inte."""
    invitations = db.scalars(
        select(Invitation)
        .where(
            Invitation.invited_by_id == user.id,
            Invitation.kind == InvitationKind.SUPERVISOR,
        )
        .order_by(Invitation.created_at.desc())
    ).all()
    # Visa bara den senaste inbjudan per e-post.
    seen: set[str] = set()
    result = []
    for invitation in invitations:
        if invitation.email in seen:
            continue
        seen.add(invitation.email)
        result.append(_read(db, invitation))
    return result


def _own_invitation(db: DbSession, user: User, invitation_id: UUID) -> Invitation:
    invitation = db.get(Invitation, invitation_id)
    if invitation is None or invitation.invited_by_id != user.id:
        raise _not_found()
    return invitation


@router.post("/{invitation_id}/resend", response_model=InvitationRead)
def resend_invitation(invitation_id: UUID, db: DbSession, user: CanInvite) -> InvitationRead:
    """Skickar mejlet igen med en ny länk. Den gamla länken slutar fungera."""
    invitation = _own_invitation(db, user, invitation_id)
    if invitation.accepted_at is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Handledaren har redan skapat sitt konto"
        )
    invitation.revoked_at = None
    _send(db, invitation, user)
    db.commit()
    return _read(db, invitation)


@router.delete("/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invitation(invitation_id: UUID, db: DbSession, user: CanInvite) -> Response:
    """Återkallar en inbjudan som inte är använd. Länken slutar fungera."""
    invitation = _own_invitation(db, user, invitation_id)
    if invitation.accepted_at is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Handledaren har redan skapat sitt konto"
        )
    invitation.revoked_at = time.now()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Länken i mejlet (ingen inloggning) ---------------------------------------------------


@public_router.get("/{token}", response_model=InvitePreview)
def preview_invite(token: str, db: DbSession) -> InvitePreview:
    """Vem som bjöd in och till vad, så att sidan kan visa rätt formulär."""
    invitation = _by_token(db, token)
    return InvitePreview(
        kind=invitation.kind,
        email=invitation.email,
        invited_by_name=invitation.invited_by.name,
        school_name=invitation.school.name,
        workplace_name=invitation.workplace.name if invitation.workplace else None,
    )


@public_router.post("/{token}/accept", response_model=MeRead)
def accept_invite(token: str, body: AcceptInvite, db: DbSession, response: Response) -> MeRead:
    """Skapar handledarens konto (och företagsprofil) och loggar in hen."""
    invitation = _by_token(db, token)
    # Lås inbjudan så att två samtidiga anrop inte skapar två konton.
    db.execute(select(Invitation.id).where(Invitation.id == invitation.id).with_for_update())
    if invitation.kind == InvitationKind.SUPERVISOR and body.company is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Fyll i uppgifterna om företaget"
        )
    _check_email_free_for_supervisor(db, invitation.email)

    supervisor = db.scalar(select(User).where(User.email == invitation.email))
    if supervisor is None:
        supervisor = create_account(
            db,
            email=invitation.email,
            name=body.name,
            role=UserRole.SUPERVISOR,
            school_id=None,
            password_hash=hash_password(body.password),
        )
    else:
        # Ett konto utan lösenord, t.ex. skapat av skoladmin innan inbjudningar fanns.
        supervisor.name = body.name
        supervisor.password_hash = hash_password(body.password)
        supervisor.is_active = True

    inviter = invitation.invited_by
    if invitation.kind == InvitationKind.COLLEAGUE:
        workplace = invitation.workplace
        assert workplace is not None
        if workplace.owner_teacher_id:
            notify(
                db,
                workplace.owner_teacher_id,
                f"{body.name} är nu handledare på {workplace.name}.",
                "/placements",
            )
        notify(
            db,
            inviter.id,
            f"{body.name} har tackat ja och är nu handledare på {workplace.name}.",
            "/company",
        )
    else:
        company = body.company
        assert company is not None
        workplace = Workplace(
            school_id=invitation.school_id,
            name=company.name,
            address=company.address,
            industry=company.industry,
            description=company.description,
            owner_teacher_id=inviter.id if inviter.role == UserRole.TEACHER else None,
        )
        db.add(workplace)
        db.flush()
        notify(
            db,
            inviter.id,
            f"{body.name} har skapat företagsprofilen {company.name}. "
            "Nu kan du placera elever där.",
            "/placements",
        )
    db.execute(
        insert(workplace_supervisors)
        .values(workplace_id=workplace.id, supervisor_id=supervisor.id)
        .on_conflict_do_nothing()
    )
    invitation.accepted_at = time.now()
    invitation.accepted_user_id = supervisor.id
    db.commit()
    start_session(db, supervisor, response)
    return me_read(supervisor)


# --- Handledaren: företagsprofil och kollegor ---------------------------------------------


def _supervisor_workplace(db: DbSession, user: User, workplace_id: UUID) -> Workplace:
    workplace = db.scalar(
        select(Workplace)
        .join(workplace_supervisors, workplace_supervisors.c.workplace_id == Workplace.id)
        .where(Workplace.id == workplace_id, workplace_supervisors.c.supervisor_id == user.id)
    )
    if workplace is None:
        raise _not_found()
    return workplace


def _pending_colleague_invitations(db: DbSession, workplace_id: UUID) -> list[Invitation]:
    rows = db.scalars(
        select(Invitation).where(
            Invitation.workplace_id == workplace_id,
            Invitation.accepted_at.is_(None),
            Invitation.revoked_at.is_(None),
            Invitation.expires_at > time.now(),
        )
    ).all()
    return list(rows)


def _supervisor_workplace_read(db: DbSession, workplace: Workplace) -> SupervisorWorkplace:
    colleagues = [s for s in workplace.supervisors if s.is_active]
    pending = _pending_colleague_invitations(db, workplace.id)
    school = db.get(School, workplace.school_id)
    school_name = school.name if school else ""
    return SupervisorWorkplace(
        id=workplace.id,
        name=workplace.name,
        address=workplace.address,
        industry=workplace.industry,
        description=workplace.description,
        school_name=school_name,
        supervisors=[Colleague(id=s.id, name=s.name, email=s.email) for s in colleagues],
        pending_invitations=[_read(db, i) for i in pending],
        can_invite=len(colleagues) - 1 + len(pending) < MAX_COLLEAGUES,
    )


@supervisor_router.get("", response_model=list[SupervisorWorkplace])
def my_workplaces(db: DbSession, user: Supervisor) -> list[SupervisorWorkplace]:
    """Handledarens arbetsplatser med företagsprofil, kollegor och väntande inbjudningar."""
    workplaces = db.scalars(
        select(Workplace)
        .join(workplace_supervisors, workplace_supervisors.c.workplace_id == Workplace.id)
        .where(workplace_supervisors.c.supervisor_id == user.id)
        .options(selectinload(Workplace.supervisors))
        .order_by(Workplace.name)
    ).all()
    return [_supervisor_workplace_read(db, w) for w in workplaces]


@supervisor_router.put("/{workplace_id}", response_model=SupervisorWorkplace)
def update_profile(
    workplace_id: UUID, body: CompanyProfile, db: DbSession, user: Supervisor
) -> SupervisorWorkplace:
    """Handledaren ändrar företagsprofilen."""
    workplace = _supervisor_workplace(db, user, workplace_id)
    workplace.name = body.name
    workplace.address = body.address
    workplace.industry = body.industry
    workplace.description = body.description
    db.commit()
    db.refresh(workplace)
    return _supervisor_workplace_read(db, workplace)


@supervisor_router.post(
    "/{workplace_id}/invitations",
    response_model=SupervisorWorkplace,
    status_code=status.HTTP_201_CREATED,
)
def invite_colleague(
    workplace_id: UUID, body: Email, db: DbSession, user: Supervisor
) -> SupervisorWorkplace:
    """Bjuder in en kollega som handledare på arbetsplatsen. Högst tre kollegor."""
    workplace = _supervisor_workplace(db, user, workplace_id)
    # Lås arbetsplatsen så att två samtidiga inbjudningar inte går förbi gränsen.
    db.execute(select(Workplace.id).where(Workplace.id == workplace.id).with_for_update())
    if any(s.email == body.email for s in workplace.supervisors):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Personen är redan handledare här")
    colleagues = len([s for s in workplace.supervisors if s.is_active]) - 1
    pending = [i for i in _pending_colleague_invitations(db, workplace.id) if i.email != body.email]
    if colleagues + len(pending) >= MAX_COLLEAGUES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"Du kan bjuda in högst {MAX_COLLEAGUES} kollegor",
        )
    _check_email_free_for_supervisor(db, body.email)
    _create(db, user, body.email, InvitationKind.COLLEAGUE, workplace.school_id, workplace)
    db.refresh(workplace)
    return _supervisor_workplace_read(db, workplace)


# --- Notiser ------------------------------------------------------------------------------


@notification_router.get("", response_model=NotificationList)
def list_notifications(db: DbSession, user: CurrentUser) -> NotificationList:
    """De senaste 30 notiserna och antal olästa."""
    rows = db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(30)
    ).all()
    unread = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    )
    return NotificationList(
        unread=unread or 0,
        items=[
            NotificationRead(
                id=n.id,
                text=n.text,
                link=n.link,
                created_at=n.created_at,
                read=n.read_at is not None,
            )
            for n in rows
        ],
    )


@notification_router.post("/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(db: DbSession, user: CurrentUser) -> Response:
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=time.now())
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
