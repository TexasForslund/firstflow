import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

_hasher = PasswordHasher()

# Används när e-postadressen inte finns, så att ett misslyckat försök tar lika lång
# tid oavsett om kontot finns eller inte.
_DUMMY_HASH = _hasher.hash("firstflow-dummy-password")


def normalize_email(email: str) -> str:
    """E-post sparas och jämförs alltid i gemener utan omgivande blanksteg."""
    return email.strip().lower()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, InvalidHashError):
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
