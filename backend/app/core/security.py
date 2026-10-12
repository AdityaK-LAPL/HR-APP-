"""Password hashing, JWT access tokens, opaque refresh tokens, and CSRF tokens.

Passwords use Argon2id (slow, memory-hard - appropriate for low-entropy
user-chosen secrets). Refresh/CSRF tokens are high-entropy random values
hashed with SHA-256 purely for at-rest lookup/comparison, not for
brute-force resistance - a fast hash is correct there because the input
already has enough entropy that guessing it is infeasible; using a slow
hash for a 48-byte random token would only waste CPU on every request.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHash, VerifyMismatchError

from app.core.config import get_settings
from app.core.errors import AuthenticationError, ValidationFailedError

_password_hasher = PasswordHasher()

MIN_PASSWORD_LENGTH = 8


# The passwords people reach for first. Not a substitute for a breach list - just the cheap
# check that stops "password" and "12345678" being accepted as a new password.
_COMMON_PASSWORDS = frozenset(
    {
        "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "12345678",
        "123456789", "1234567890", "qwerty123", "qwertyuiop", "iloveyou", "welcome1", "welcome123",
        "admin123", "administrator", "letmein123", "abc12345", "changeme", "changeme123",
        "company123", "11111111", "00000000", "88888888", "987654321",
    }
)  # fmt: skip


def validate_password_strength(password: str, *, employee_code: str | None = None) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValidationFailedError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters long."
        )
    folded = password.strip().lower()
    if folded in _COMMON_PASSWORDS or len(set(folded)) == 1:
        raise ValidationFailedError("That password is too easy to guess. Choose another one.")
    if employee_code and employee_code.strip().lower() in folded:
        raise ValidationFailedError("The password must not contain your employee ID.")


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHash):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _password_hasher.check_needs_rehash(password_hash)


def create_access_token(*, user_id: uuid.UUID, role: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_expire_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise AuthenticationError("Invalid or expired session.") from exc
    if payload.get("type") != "access":
        raise AuthenticationError("Invalid or expired session.")
    return payload


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_opaque_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)
