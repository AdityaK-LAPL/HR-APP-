"""Unit tests for app/core/security.py - no database required."""

import uuid

import jwt
import pytest

from app.core.errors import AuthenticationError, ValidationFailedError
from app.core.security import (
    create_access_token,
    decode_access_token,
    generate_csrf_token,
    generate_refresh_token,
    hash_opaque_token,
    hash_password,
    validate_password_strength,
    verify_password,
)


def test_password_hash_roundtrip():
    password = "correct horse battery staple"
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed) is True


def test_password_hash_rejects_wrong_password():
    hashed = hash_password("correct horse battery staple")
    assert verify_password("wrong password", hashed) is False


def test_password_hash_is_salted_and_differs_each_time():
    password = "correct horse battery staple"
    assert hash_password(password) != hash_password(password)


def test_validate_password_strength_rejects_short_passwords():
    with pytest.raises(ValidationFailedError):
        validate_password_strength("short")


def test_validate_password_strength_allows_long_enough_passwords():
    validate_password_strength("longenoughpassword")


def test_access_token_roundtrip():
    user_id = uuid.uuid4()
    token = create_access_token(user_id=user_id, role="manager")
    payload = decode_access_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["role"] == "manager"
    assert payload["type"] == "access"


def test_access_token_rejects_tampered_signature():
    user_id = uuid.uuid4()
    token = create_access_token(user_id=user_id, role="employee")
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    with pytest.raises(AuthenticationError):
        decode_access_token(tampered)


def test_access_token_rejects_wrong_token_type():
    # A token that decodes fine but was never issued as an access token
    # (e.g. someone tries to replay a different kind of token) must be
    # rejected, not silently accepted.
    from app.core.config import get_settings

    settings = get_settings()
    bogus = jwt.encode(
        {"sub": str(uuid.uuid4()), "role": "owner", "type": "not-access"},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    with pytest.raises(AuthenticationError):
        decode_access_token(bogus)


def test_refresh_token_is_high_entropy_and_unique():
    tokens = {generate_refresh_token() for _ in range(100)}
    assert len(tokens) == 100
    assert all(len(t) >= 40 for t in tokens)


def test_refresh_token_hash_is_deterministic_and_not_reversible_looking():
    token = generate_refresh_token()
    assert hash_opaque_token(token) == hash_opaque_token(token)
    assert hash_opaque_token(token) != token


def test_csrf_token_unique_each_call():
    assert generate_csrf_token() != generate_csrf_token()
