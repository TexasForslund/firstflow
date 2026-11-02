"""Meddelanden: samtal två och två och grupper, med bilder, filer och projekt (B11).

Beslut (Texas, 2026-11-02):
- Samtal två och två och grupper. Vem som får starta ett samtal med vem står i
  `app/services/messaging.py`.
- Gruppen för en praktikplats skapas automatiskt.
- Nya meddelanden syns direkt via en ström (server-sent events), `GET /api/messages/events`.
- Den som inte är inne i Firstflow får ett mejl, högst ett per samtal tills det är läst. Mejlet
  innehåller inte texten.
Innehållet i meddelanden loggas aldrig.
"""

import asyncio
import contextlib
import json
import logging
import time as clock
from collections.abc import AsyncIterator, Iterator
from datetime import date, datetime, timedelta
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import and_, func, select, union
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_roles, session_cookie
from app.core import time
from app.core.config import settings
from app.db.session import DbSession, SessionLocal
from app.models.message import Conversation, ConversationMember, Message, MessageAttachment
from app.models.placement import Placement
from app.models.project import Project, project_students, project_supervisors
from app.models.user import User, UserRole
from app.services import messaging
from app.services.email import send_email

logger = logging.getLogger("firstflow.messages")

router = APIRouter(prefix="/messages", tags=["messages"])

ROLES = (UserRole.TEACHER, UserRole.SUPERVISOR, UserRole.STUDENT, UserRole.SYV)
Member = Annotated[User, Depends(require_roles(*ROLES))]

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_FILES = 10
PAGE_SIZE = 50
# Den som har haft appen öppen den senaste minuten räknas som inne och får inget mejl.
ONLINE_WINDOW = timedelta(seconds=60)

IMAGE_TYPES = {
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"GIF87a": "image/gif",
    b"GIF89a": "image/gif",
}

GroupName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


class ConversationPerson(BaseModel):
    id: UUID
    name: str
    description: str


class ProjectCard(BaseModel):
    id: UUID
    name: str
    workplace_name: str | None
    deadline: date | None
    # Sidan för projektet för den som läser, eller None om hen inte kan öppna det.
    url: str | None


class AttachmentRead(BaseModel):
    id: UUID
    filename: str
    content_type: str
    size: int
    is_image: bool
    url: str


class MessageRead(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_id: UUID | None
    sender_name: str | None
    mine: bool
    text: str | None
    project: ProjectCard | None
    attachments: list[AttachmentRead]
    created_at: datetime


class MessagePage(BaseModel):
    messages: list[MessageRead]
    has_more: bool


class ConversationRead(BaseModel):
    id: UUID
    title: str
    is_group: bool
    is_placement_group: bool
    # De andra i samtalet.
    members: list[ConversationPerson]
    preview: str | None
    last_message_at: datetime | None
    unread: int


class ConversationCreate(BaseModel):
    member_ids: list[UUID] = Field(min_length=1, max_length=30)
    name: GroupName | None = None


class Unread(BaseModel):
    count: int


class ProjectChoice(BaseModel):
    id: UUID
    name: str
    workplace_name: str | None
    completed: bool


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")


def _membership(db: Session, user: User, conversation_id: UUID) -> ConversationMember:
    member = db.get(ConversationMember, (conversation_id, user.id))
    if member is None:
        raise _not_found()
    return member


def _unread_counts(db: Session, user_id: UUID) -> dict[UUID, int]:
    me = ConversationMember
    rows = db.execute(
        select(Message.conversation_id, func.count(Message.id))
        .join(me, and_(me.conversation_id == Message.conversation_id, me.user_id == user_id))
        .where(
            Message.sender_id.is_distinct_from(user_id),
            Message.created_at > func.coalesce(me.last_read_at, datetime(1970, 1, 1)),
        )
        .group_by(Message.conversation_id)
    )
    return {conversation_id: count for conversation_id, count in rows}


def _title(conversation: Conversation, others: list[User]) -> str:
    if conversation.name:
        return conversation.name
    if not others:
        return "Bara du"
    if not conversation.is_group:
        return others[0].name
    names = [messaging.first_name(u) for u in others]
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} och {names[-1]}"


def _preview(message: Message | None, user: User, is_group: bool) -> str | None:
    if message is None:
        return None
    if message.text:
        body = message.text.strip().splitlines()[0] if message.text.strip() else ""
    elif message.attachments:
        first = message.attachments[0]
        body = "Bild" if first.is_image else f"Fil: {first.filename}"
    elif message.project_id is not None:
        body = "Delade ett projekt"
    else:
        body = ""
    if message.sender_id == user.id:
        return f"Du: {body}"
    if is_group and message.sender is not None:
        return f"{messaging.first_name(message.sender)}: {body}"
    return body


def _conversations(
    db: Session, user: User, ids: list[UUID] | None = None
) -> list[ConversationRead]:
    query = (
        select(Conversation)
        .join(ConversationMember)
        .where(ConversationMember.user_id == user.id)
        .options(selectinload(Conversation.members).selectinload(ConversationMember.user))
        .order_by(func.coalesce(Conversation.last_message_at, Conversation.created_at).desc())
    )
    if ids is not None:
        query = query.where(Conversation.id.in_(ids))
    conversations = list(db.scalars(query))
    if not conversations:
        return []
    unread = _unread_counts(db, user.id)
    # Senaste meddelandet i varje samtal.
    latest_ids = (
        select(
            Message.id,
            func.row_number()
            .over(partition_by=Message.conversation_id, order_by=Message.created_at.desc())
            .label("n"),
        )
        .where(Message.conversation_id.in_([c.id for c in conversations]))
        .subquery()
    )
    latest = {
        m.conversation_id: m
        for m in db.scalars(
            select(Message)
            .join(latest_ids, latest_ids.c.id == Message.id)
            .where(latest_ids.c.n == 1)
            .options(selectinload(Message.attachments), selectinload(Message.sender))
        )
    }
    others_all = [m.user for c in conversations for m in c.members if m.user_id != user.id]
    descriptions = messaging.describe(db, list({u.id: u for u in others_all}.values()))
    result = []
    for c in conversations:
        others = sorted((m.user for m in c.members if m.user_id != user.id), key=lambda u: u.name)
        result.append(
            ConversationRead(
                id=c.id,
                title=_title(c, others),
                is_group=c.is_group,
                is_placement_group=c.placement_id is not None,
                members=[
                    ConversationPerson(id=u.id, name=u.name, description=descriptions[u.id])
                    for u in others
                ],
                preview=_preview(latest.get(c.id), user, c.is_group),
                last_message_at=c.last_message_at,
                unread=unread.get(c.id, 0),
            )
        )
    return result


def _project_url(user: User, project: Project) -> str | None:
    if user.role in (UserRole.TEACHER, UserRole.SUPERVISOR):
        return f"/projects/{project.id}"
    if user.role == UserRole.STUDENT:
        return f"/my-projects/{project.id}"
    return None


def _project_ids_for(db: Session, user: User) -> set[UUID]:
    """Projekt som användaren kan öppna."""
    if user.role == UserRole.TEACHER:
        return set(db.scalars(select(Project.id).where(Project.owner_id == user.id)))
    if user.role == UserRole.SUPERVISOR:
        return set(
            db.scalars(
                select(project_supervisors.c.project_id).where(
                    project_supervisors.c.supervisor_id == user.id
                )
            )
        )
    if user.role == UserRole.STUDENT:
        return set(
            db.scalars(
                select(project_students.c.project_id).where(
                    project_students.c.student_id == user.id
                )
            )
        )
    return set()


def _message_reads(db: Session, user: User, messages: list[Message]) -> list[MessageRead]:
    project_ids = {m.project_id for m in messages if m.project_id}
    projects = (
        {
            p.id: p
            for p in db.scalars(
                select(Project)
                .where(Project.id.in_(project_ids))
                .options(selectinload(Project.workplace))
            )
        }
        if project_ids
        else {}
    )
    can_open = _project_ids_for(db, user) if projects else set()
    reads = []
    for m in messages:
        project = projects.get(m.project_id) if m.project_id else None
        reads.append(
            MessageRead(
                id=m.id,
                conversation_id=m.conversation_id,
                sender_id=m.sender_id,
                sender_name=m.sender.name if m.sender else None,
                mine=m.sender_id == user.id,
                text=m.text,
                project=ProjectCard(
                    id=project.id,
                    name=project.name,
                    workplace_name=project.workplace.name if project.workplace else None,
                    deadline=project.deadline,
                    url=_project_url(user, project) if project.id in can_open else None,
                )
                if project
                else None,
                attachments=[
                    AttachmentRead(
                        id=a.id,
                        filename=a.filename,
                        content_type=a.content_type,
                        size=a.size,
                        is_image=a.is_image,
                        url=f"/api/messages/attachments/{a.id}",
                    )
                    for a in m.attachments
                ],
                created_at=m.created_at,
            )
        )
    return reads


def _mail_others(db: Session, sender: User, conversation: Conversation) -> None:
    """Mejlar de andra i samtalet som inte är inne, högst en gång per samtal tills de läst."""
    now = time.now()
    for member in conversation.members:
        person = member.user
        if member.user_id == sender.id or member.emailed_at is not None or not person.is_active:
            continue
        if person.last_seen_at is not None and person.last_seen_at > now - ONLINE_WINDOW:
            continue
        where = (
            f" i gruppen {conversation.name}" if conversation.is_group and conversation.name else ""
        )
        link = f"{settings.frontend_url.rstrip('/')}/messages/{conversation.id}"
        try:
            send_email(
                person.email,
                f"Nytt meddelande från {sender.name}",
                f"Hej {messaging.first_name(person)}!\n\n"
                f"{sender.name} har skickat ett meddelande till dig i Firstflow{where}.\n\n"
                f"Läs det här: {link}\n\n"
                "Du får inget mer mejl om det här samtalet förrän du har läst det.",
            )
        except Exception:  # noqa: BLE001
            # Meddelandet är sparat ändå. Loggen visar bara att mejlet inte gick iväg.
            logger.exception("Kunde inte mejla om ett nytt meddelande")
            continue
        member.emailed_at = now


# --- Samtal --------------------------------------------------------------------------------


@router.get("/contacts", response_model=list[ConversationPerson])
def list_contacts(db: DbSession, user: Member) -> list[ConversationPerson]:
    """Dem användaren kan starta ett samtal med."""
    return [
        ConversationPerson(id=c.user.id, name=c.user.name, description=c.description)
        for c in messaging.contacts(db, user)
    ]


@router.get("/conversations", response_model=list[ConversationRead])
def list_conversations(db: DbSession, user: Member) -> list[ConversationRead]:
    return _conversations(db, user)


@router.get("/unread", response_model=Unread)
def unread(db: DbSession, user: Member) -> Unread:
    return Unread(count=sum(_unread_counts(db, user.id).values()))


@router.post("/conversations", response_model=ConversationRead)
def start_conversation(body: ConversationCreate, db: DbSession, user: Member) -> ConversationRead:
    """Startar ett samtal. Med en person: samtalet ni redan har, om det finns.

    Alla måste vara personer som användaren får skriva till (422 annars).
    """
    ids = set(body.member_ids) - {user.id}
    if not ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Välj minst en person")
    allowed = {c.user.id for c in messaging.contacts(db, user)}
    if not ids <= allowed:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Du kan inte skriva till alla du valde"
        )
    if len(ids) == 1:
        (other,) = ids
        mine = select(ConversationMember.conversation_id).where(
            ConversationMember.user_id == user.id
        )
        theirs = select(ConversationMember.conversation_id).where(
            ConversationMember.user_id == other
        )
        existing = db.scalar(
            select(Conversation.id).where(
                Conversation.is_group.is_(False),
                Conversation.id.in_(mine),
                Conversation.id.in_(theirs),
            )
        )
        if existing is not None:
            return _conversations(db, user, [existing])[0]
    conversation = Conversation(
        name=body.name or None,
        is_group=len(ids) > 1,
        created_by_id=user.id,
        members=[ConversationMember(user_id=i) for i in {user.id, *ids}],
    )
    db.add(conversation)
    db.commit()
    return _conversations(db, user, [conversation.id])[0]


@router.get("/placement-group", response_model=ConversationRead)
def placement_group(
    student_id: Annotated[UUID, Query()], db: DbSession, user: Member
) -> ConversationRead:
    """Gruppen för elevens pågående eller senaste praktikplats, om användaren är med i den."""
    conversation_id = db.scalar(
        select(Conversation.id)
        .join(Placement, Placement.id == Conversation.placement_id)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(Placement.student_id == student_id, ConversationMember.user_id == user.id)
        .order_by(Placement.end_date < time.today(), Placement.start_date.desc())
        .limit(1)
    )
    if conversation_id is None:
        raise _not_found()
    return _conversations(db, user, [conversation_id])[0]


@router.get("/conversations/{conversation_id}", response_model=ConversationRead)
def get_conversation(conversation_id: UUID, db: DbSession, user: Member) -> ConversationRead:
    _membership(db, user, conversation_id)
    return _conversations(db, user, [conversation_id])[0]


@router.post("/conversations/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(conversation_id: UUID, db: DbSession, user: Member) -> Response:
    member = _membership(db, user, conversation_id)
    member.last_read_at = time.now()
    member.emailed_at = None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/conversations/{conversation_id}/projects", response_model=list[ProjectChoice])
def shareable_projects(conversation_id: UUID, db: DbSession, user: Member) -> list[ProjectChoice]:
    """Projekt användaren kan dela i samtalet: projekt hen kan öppna där någon annan i samtalet
    är med som elev, handledare eller lärare."""
    _membership(db, user, conversation_id)
    others = select(ConversationMember.user_id).where(
        ConversationMember.conversation_id == conversation_id,
        ConversationMember.user_id != user.id,
    )
    with_others = union(
        select(Project.id).where(Project.owner_id.in_(others)),
        select(project_students.c.project_id).where(project_students.c.student_id.in_(others)),
        select(project_supervisors.c.project_id).where(
            project_supervisors.c.supervisor_id.in_(others)
        ),
    )
    ids = _project_ids_for(db, user) & set(db.scalars(with_others))
    if not ids:
        return []
    projects = db.scalars(
        select(Project)
        .where(Project.id.in_(ids))
        .options(selectinload(Project.workplace))
        .order_by(Project.completed_at.is_not(None), Project.name)
    )
    return [
        ProjectChoice(
            id=p.id,
            name=p.name,
            workplace_name=p.workplace.name if p.workplace else None,
            completed=p.completed_at is not None,
        )
        for p in projects
    ]


# --- Meddelanden ---------------------------------------------------------------------------


@router.get("/conversations/{conversation_id}/messages", response_model=MessagePage)
def list_messages(
    conversation_id: UUID,
    db: DbSession,
    user: Member,
    before: Annotated[datetime | None, Query()] = None,
) -> MessagePage:
    """De senaste meddelandena, äldst först. `before` hämtar äldre."""
    _membership(db, user, conversation_id)
    query = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .options(selectinload(Message.attachments), selectinload(Message.sender))
        .order_by(Message.created_at.desc())
        .limit(PAGE_SIZE + 1)
    )
    if before is not None:
        query = query.where(Message.created_at < before)
    messages = list(db.scalars(query))
    has_more = len(messages) > PAGE_SIZE
    messages = list(reversed(messages[:PAGE_SIZE]))
    return MessagePage(messages=_message_reads(db, user, messages), has_more=has_more)


def _clean_filename(name: str | None) -> str:
    base = (name or "fil").replace("\\", "/").split("/")[-1].strip() or "fil"
    return base[:200]


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    conversation_id: UUID,
    db: DbSession,
    user: Member,
    text: Annotated[str | None, Form(max_length=4000)] = None,
    project_id: Annotated[UUID | None, Form()] = None,
    files: Annotated[
        list[UploadFile] | None, File(description="Bilder och filer, högst 10 MB var")
    ] = None,
) -> MessageRead:
    files = files or []
    text = (text or "").strip() or None
    if text is None and project_id is None and not files:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Meddelandet är tomt")
    if len(files) > MAX_FILES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"Högst {MAX_FILES} filer åt gången"
        )
    attachments = []
    for position, upload in enumerate(files):
        data = await upload.read(MAX_FILE_BYTES + 1)
        name = _clean_filename(upload.filename)
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"{name} är större än 10 MB"
            )
        if not data:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"{name} är tom")
        image_type = next((t for magic, t in IMAGE_TYPES.items() if data.startswith(magic)), None)
        if image_type is None and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            image_type = "image/webp"
        attachments.append(
            MessageAttachment(
                position=position,
                filename=name,
                content_type=image_type
                or (upload.content_type or "application/octet-stream")[:100],
                size=len(data),
                is_image=image_type is not None,
                data=data,
            )
        )

    def save() -> MessageRead:
        _membership(db, user, conversation_id)
        if project_id is not None and project_id not in shareable_ids():
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Projektet går inte att dela här"
            )
        conversation = db.scalar(
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .options(selectinload(Conversation.members).selectinload(ConversationMember.user))
            .with_for_update(of=Conversation)
        )
        assert conversation is not None
        now = time.now()
        message = Message(
            conversation_id=conversation.id,
            sender=user,
            text=text,
            project_id=project_id,
            created_at=now,
            attachments=attachments,
        )
        db.add(message)
        conversation.last_message_at = now
        for member in conversation.members:
            if member.user_id == user.id:
                member.last_read_at = now
        _mail_others(db, user, conversation)
        db.commit()
        return _message_reads(db, user, [message])[0]

    def shareable_ids() -> set[UUID]:
        return {p.id for p in shareable_projects(conversation_id, db, user)}

    return await run_in_threadpool(save)


@router.get("/attachments/{attachment_id}")
def get_attachment(attachment_id: UUID, db: DbSession, user: Member) -> Response:
    """En bild eller fil. Bara de som är med i samtalet får hämta den.

    Bilder visas i appen. Andra filer laddas alltid ner, så att en uppladdad HTML-fil inte kan
    köras i Firstflow.
    """
    attachment = db.get(MessageAttachment, attachment_id)
    if attachment is None:
        raise _not_found()
    message = db.get(Message, attachment.message_id)
    assert message is not None
    _membership(db, user, message.conversation_id)
    disposition = "inline" if attachment.is_image else "attachment"
    return Response(
        content=attachment.data,
        media_type=attachment.content_type if attachment.is_image else "application/octet-stream",
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(attachment.filename)}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=86400",
        },
    )


# --- Realtid -------------------------------------------------------------------------------

# Hur ofta strömmen kollar efter nya meddelanden, och hur länge den är öppen innan webbläsaren
# kopplar upp igen. Ändras i testerna.
TICK_SECONDS = 2.0
STREAM_SECONDS = 600.0
HEARTBEAT_SECONDS = 15.0
SEEN_EVERY_SECONDS = 30.0


@contextlib.contextmanager
def session_scope() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


def _state(user_id: UUID, mark_seen: bool) -> dict[str, object]:
    with session_scope() as db:
        counts = _unread_counts(db, user_id)
        latest = db.scalar(
            select(func.max(Conversation.last_message_at))
            .join(ConversationMember)
            .where(ConversationMember.user_id == user_id)
        )
        if mark_seen:
            user = db.get(User, user_id)
            if user is not None:
                user.last_seen_at = time.now()
                db.commit()
        return {
            "unread": sum(counts.values()),
            "latest": latest.isoformat() if latest else None,
        }


@router.get("/events")
async def events(
    request: Request, token: Annotated[str | None, Depends(session_cookie)]
) -> StreamingResponse:
    """Ström med antal olästa och tiden för det senaste meddelandet. Skickas när något ändras.

    Strömmen stängs efter tio minuter och webbläsaren kopplar då upp igen. Proxyn framför API:t
    får inte buffra svaret (se docs/driftsattning.md).
    """

    def authenticate() -> tuple[UUID, UserRole]:
        with session_scope() as db:
            user = get_current_user(db, token)
            return user.id, user.role

    user_id, role = await run_in_threadpool(authenticate)
    if role not in ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Du saknar behörighet")

    async def stream() -> AsyncIterator[str]:
        started = clock.monotonic()
        last_state: dict[str, object] | None = None
        last_sent = started
        last_seen = 0.0
        yield "retry: 3000\n\n"
        while clock.monotonic() - started < STREAM_SECONDS:
            if await request.is_disconnected():
                break
            now = clock.monotonic()
            mark_seen = now - last_seen >= SEEN_EVERY_SECONDS
            state = await run_in_threadpool(_state, user_id, mark_seen)
            if mark_seen:
                last_seen = now
            if state != last_state:
                yield f"event: messages\ndata: {json.dumps(state)}\n\n"
                last_state = state
                last_sent = now
            elif now - last_sent >= HEARTBEAT_SECONDS:
                yield ": ping\n\n"
                last_sent = now
            await asyncio.sleep(TICK_SECONDS)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
