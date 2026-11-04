"""Logg över inloggningar och ändringar (B6).

Två sorters händelser hamnar i `audit_events`:

- **Inloggning och lösenord:** `log_event` anropas direkt, t.ex. vid lyckad och misslyckad
  inloggning, utloggning, Glömt lösenord och nytt lösenord.
- **Ändringar i data:** lyssnare på databassessionen loggar varje insert, update och delete
  som görs medan en användare är inloggad, med tabell, radens id och vilka fält som ändrades.

Loggen sparar aldrig namn, e-post eller värden. Bara id:n, tabellnamn och fältnamn.

Vem som gör ändringen sätts med `set_actor`, vilket `get_current_user` gör i varje anrop.
Ändringar utan inloggad användare (skript som `seed_demo`) loggas inte.

Händelserna samlas under transaktionen och sparas när den committas, så att en ändring som
rullas tillbaka inte heller loggas.
"""

import uuid
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import ORMExecuteState, Session

from app.core import time
from app.models.security import AuditEvent

_ACTOR = "audit_actor"
_PENDING = "audit_pending"

# Tabeller som inte loggas: sessioner och inloggningsskyddet har egna händelser, notiser är
# bara följder av andra ändringar, och loggen ska inte logga sig själv.
SKIPPED_TABLES = frozenset(
    {
        "audit_events",
        "user_sessions",
        "rate_limit_events",
        "password_resets",
        "notifications",
    }
)
# Fält som ändras av sig själva och inte är en ändring som någon har gjort.
SKIPPED_FIELDS = frozenset({"last_seen_at"})


def set_actor(db: Session, user_id: uuid.UUID | None) -> None:
    """Användaren som gör ändringarna i sessionen. None stänger av loggningen av ändringar."""
    db.info[_ACTOR] = user_id


def _pending(db: Session) -> list[dict[str, Any]]:
    return db.info.setdefault(_PENDING, [])


def log_event(
    db: Session,
    action: str,
    actor_id: uuid.UUID | None = None,
    *,
    entity: str | None = None,
    entity_id: str | None = None,
) -> None:
    """Loggar en händelse. Den sparas när sessionen committas."""
    _pending(db).append(
        {
            "created_at": time.now(),
            "actor_id": actor_id,
            "action": action,
            "entity": entity,
            "entity_id": entity_id,
            "fields": None,
        }
    )


def _record_change(
    db: Session,
    action: str,
    table: str,
    entity_id: str | None = None,
    fields: list[str] | None = None,
) -> None:
    actor_id = db.info.get(_ACTOR)
    if actor_id is None or table in SKIPPED_TABLES:
        return
    _pending(db).append(
        {
            "created_at": time.now(),
            "actor_id": actor_id,
            "action": action,
            "entity": table,
            "entity_id": entity_id,
            "fields": fields,
        }
    )


def _identity(obj: object) -> str | None:
    """Radens primärnyckel. Nya rader har den först efter flush, så den läses från objektet."""
    key = inspect(obj).mapper.primary_key_from_instance(obj)
    if any(part is None for part in key):
        return None
    return ",".join(str(part) for part in key)


@event.listens_for(Session, "after_flush")
def _after_flush(db: Session, _flush_context: object) -> None:
    if db.info.get(_ACTOR) is None:
        return
    for obj in db.new:
        if not isinstance(obj, AuditEvent):
            _record_change(db, "insert", obj.__table__.name, _identity(obj))  # type: ignore[attr-defined]
    for obj in db.dirty:
        if isinstance(obj, AuditEvent):
            continue
        state = inspect(obj)
        fields = sorted(
            attr.key
            for attr in state.mapper.column_attrs
            if attr.key not in SKIPPED_FIELDS and state.attrs[attr.key].history.has_changes()
        )
        if fields:
            _record_change(db, "update", obj.__table__.name, _identity(obj), fields)  # type: ignore[attr-defined]
    for obj in db.deleted:
        _record_change(db, "delete", obj.__table__.name, _identity(obj))  # type: ignore[attr-defined]


@event.listens_for(Session, "do_orm_execute")
def _do_orm_execute(state: ORMExecuteState) -> None:
    """Ändringar som görs med insert(), update() och delete() i stället för via objekt, t.ex. i
    kopplingstabeller som `class_students`. Radens id loggas inte, bara tabellen."""
    if not (state.is_insert or state.is_update or state.is_delete):
        return
    table = getattr(state.statement, "table", None)
    name = getattr(table, "name", None)
    if name is None:
        return
    action = "insert" if state.is_insert else "update" if state.is_update else "delete"
    _record_change(state.session, action, name)


@event.listens_for(Session, "before_commit")
def _before_commit(db: Session) -> None:
    # Flusha först, så att ändringar som inte har skickats till databasen än också loggas.
    db.flush()
    pending = db.info.pop(_PENDING, None)
    if pending:
        db.add_all(AuditEvent(**values) for values in pending)


@event.listens_for(Session, "after_soft_rollback")
def _after_rollback(db: Session, _transaction: object) -> None:
    db.info.pop(_PENDING, None)
