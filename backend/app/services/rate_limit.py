"""Begränsning av antal försök per e-post och IP (B6).

Används för inloggning (bara misslyckade försök räknas) och för Glömt lösenord (varje
begäran räknas). Räkningen sker i databasen, så att den gäller även med flera
serverprocesser. E-posten sparas bara som hash och raderna städas bort efter ett dygn.

Bakom en proxy (Broadview) måste uvicorn startas med `--proxy-headers` och
`--forwarded-allow-ips`, annars ser alla anrop ut att komma från proxyns IP.
"""

import hashlib
from dataclasses import dataclass
from datetime import timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core import time
from app.core.config import settings
from app.core.security import normalize_email
from app.models.security import RateLimitEvent

KEEP = timedelta(days=1)


@dataclass(frozen=True)
class Limit:
    kind: str
    per_email: int
    per_ip: int
    window: timedelta


def login_limit() -> Limit:
    return Limit(
        "login",
        settings.login_max_failures_per_email,
        settings.login_max_failures_per_ip,
        timedelta(minutes=settings.login_window_minutes),
    )


def password_reset_limit() -> Limit:
    return Limit(
        "password_reset",
        settings.password_reset_max_per_email,
        settings.password_reset_max_per_ip,
        timedelta(minutes=settings.password_reset_window_minutes),
    )


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "okänd"


def email_hash(email: str) -> str:
    return hashlib.sha256(normalize_email(email).encode()).hexdigest()


def check(db: Session, limit: Limit, email: str, ip: str) -> None:
    """Svarar 429 om e-posten eller IP:n har nått gränsen inom tidsfönstret."""
    since = time.now() - limit.window
    hashed = email_hash(email)
    is_email = RateLimitEvent.email_hash == hashed
    is_ip = RateLimitEvent.ip == ip
    # Ett enda anrop till databasen räknar både e-posten och IP:n.
    email_count, email_oldest, ip_count, ip_oldest = db.execute(
        select(
            func.count().filter(is_email),
            func.min(RateLimitEvent.created_at).filter(is_email),
            func.count().filter(is_ip),
            func.min(RateLimitEvent.created_at).filter(is_ip),
        ).where(
            RateLimitEvent.kind == limit.kind,
            RateLimitEvent.created_at > since,
            or_(is_email, is_ip),
        )
    ).one()
    blocked = [
        oldest
        for count, oldest, maximum in (
            (email_count, email_oldest, limit.per_email),
            (ip_count, ip_oldest, limit.per_ip),
        )
        if count >= maximum
    ]
    if blocked:
        # Spärren släpper när det äldsta försöket i fönstret är för gammalt för att räknas.
        retry_after = max(1, int((min(blocked) + limit.window - time.now()).total_seconds()) + 1)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="För många försök. Vänta en stund och försök igen.",
            headers={"Retry-After": str(retry_after)},
        )


def record(db: Session, limit: Limit, email: str, ip: str) -> None:
    """Räknar ett försök och städar bort gamla. Sparas när sessionen committas."""
    now = time.now()
    db.execute(delete(RateLimitEvent).where(RateLimitEvent.created_at < now - KEEP))
    db.add(RateLimitEvent(kind=limit.kind, email_hash=email_hash(email), ip=ip, created_at=now))


def clear(db: Session, limit: Limit, email: str) -> None:
    """Nollställer räkningen för e-posten, t.ex. efter en lyckad inloggning."""
    db.execute(
        delete(RateLimitEvent).where(
            RateLimitEvent.kind == limit.kind, RateLimitEvent.email_hash == email_hash(email)
        )
    )
