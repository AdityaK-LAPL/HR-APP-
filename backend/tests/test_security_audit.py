"""Tests that prove the fixes from the final security audit (Prompt 16).

Each test is named for the finding it covers - see docs/development-status.md, "Final security
audit". Those that need PostgreSQL are marked `requires_db`; the rest run anywhere.
"""

import io
import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text

from app.core.config import Settings
from app.core.cookies import set_auth_cookies
from app.core.errors import ValidationFailedError
from app.core.rate_limit import InMemoryRateLimiter
from app.core.security import validate_password_strength
from app.models.identity import Session as SessionModel
from tests.conftest import login, make_user, requires_db

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
GOOD_KEY = "k" * 48


def _settings(**overrides) -> Settings:
    base = {
        "database_url": "postgresql+asyncpg://x:y@localhost/db",
        "jwt_secret_key": GOOD_KEY,
        "environment": "development",
    }
    return Settings(_env_file=None, **{**base, **overrides})


# everything a production deployment must supply, so each test can break exactly one thing
PRODUCTION = {
    "environment": "production",
    "cors_allowed_origins": "https://app.example.com",
    "database_url": "postgresql+asyncpg://u:p@db.example.com:5432/postgres?ssl=require",
    "supabase_url": "https://abc.supabase.co",
    "supabase_service_role_key": "service-key",
}


# ---------------------------------------------------------------- configuration (F-config)
def test_a_short_or_placeholder_jwt_secret_stops_the_application_starting():
    for weak in (
        "short",
        "changeme-generate-a-long-random-value",
        "test-secret-key-not-for-production-use",
    ):
        with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
            _settings(jwt_secret_key=weak)
    _settings()  # a long random value is accepted


def test_production_refuses_debug_wildcard_and_plain_http_origins():
    _settings(**PRODUCTION)  # the safe combination starts
    with pytest.raises(ValueError, match="DEBUG"):
        _settings(**PRODUCTION, debug=True)
    with pytest.raises(ValueError, match="CORS_ALLOWED_ORIGINS"):
        _settings(**{**PRODUCTION, "cors_allowed_origins": ""})
    for origin in ("*", "http://app.example.com"):
        with pytest.raises(ValueError, match="https://"):
            _settings(**{**PRODUCTION, "cors_allowed_origins": origin})


def test_production_needs_real_file_storage_and_an_encrypted_database_connection():
    no_storage = {k: v for k, v in PRODUCTION.items() if not k.startswith("supabase")}
    with pytest.raises(ValueError, match="SUPABASE_URL"):
        _settings(**no_storage)
    for unencrypted in (
        "postgresql+asyncpg://u:p@db.example.com:5432/postgres",
        "postgresql+asyncpg://u:p@db.example.com:5432/postgres?ssl=prefer",
        "postgresql+asyncpg://u:p@db.example.com:5432/postgres?ssl=disable",
    ):
        with pytest.raises(ValueError, match="TLS"):
            _settings(**{**PRODUCTION, "database_url": unencrypted})
    for encrypted in ("?ssl=require", "?ssl=verify-full", "?sslmode=require"):
        _settings(**{**PRODUCTION, "database_url": f"postgresql+asyncpg://u:p@h.example.com/db{encrypted}"})
    # a database on the same machine needs no TLS, and development is never held to production rules
    _settings(**{**PRODUCTION, "database_url": "postgresql+asyncpg://u:p@localhost/db"})
    _settings(database_url="postgresql+asyncpg://u:p@db.example.com/db")


def test_only_shared_secret_jwt_algorithms_are_accepted():
    for ok in ("HS256", "HS384", "HS512"):
        _settings(jwt_algorithm=ok)
    for bad in ("none", "RS256", "hs256"):
        with pytest.raises(ValueError, match="JWT_ALGORITHM"):
            _settings(jwt_algorithm=bad)


def test_production_cookies_are_secure_httponly_and_lax(monkeypatch):
    from fastapi import Response

    monkeypatch.setattr(
        "app.core.cookies.get_settings",
        lambda: _settings(**PRODUCTION),
    )
    response = Response()
    set_auth_cookies(response, access_token="a", refresh_token="r", csrf_token="c")
    cookies = {h.split("=", 1)[0]: h for h in response.headers.getlist("set-cookie")}
    for name in ("access_token", "refresh_token", "csrf_token"):
        assert "Secure" in cookies[name] and "SameSite=lax" in cookies[name]
    assert "HttpOnly" in cookies["access_token"] and "HttpOnly" in cookies["refresh_token"]
    assert "HttpOnly" not in cookies["csrf_token"]  # the page must read it to echo it back
    assert "Path=/api/v1/auth" in cookies["refresh_token"]


# ---------------------------------------------------------------- response headers (F-headers)
async def test_every_api_response_carries_the_protective_headers(client):
    response = await client.get("/api/v1/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    # errors too
    assert (await client.get("/api/v1/auth/me")).headers["cache-control"] == "no-store"


async def test_health_does_not_announce_the_environment(client):
    assert (await client.get("/api/v1/health")).json() == {"status": "ok"}


async def test_a_caller_supplied_request_id_is_only_echoed_when_it_looks_like_one(client):
    ok = await client.get("/api/v1/health", headers={"X-Request-ID": "abc-123_DEF.456"})
    assert ok.headers["x-request-id"] == "abc-123_DEF.456"
    for hostile in ("x" * 5000, "has space and <b>markup</b>", "short"):
        replaced = await client.get("/api/v1/health", headers={"X-Request-ID": hostile})
        assert replaced.headers["x-request-id"] != hostile
        assert len(replaced.headers["x-request-id"]) == 32


# ---------------------------------------------------------------- passwords (F-password)
def test_trivial_passwords_and_passwords_containing_the_employee_id_are_refused():
    for weak in ("password", "Password123", "12345678", "aaaaaaaaaa", "ChangeMe", "iloveyou"):
        with pytest.raises(ValidationFailedError):
            validate_password_strength(weak)
    with pytest.raises(ValidationFailedError, match="employee ID"):
        validate_password_strength("Emp001@2026!", employee_code="EMP001")
    validate_password_strength("Emp001@2026!", employee_code="XYZ9")  # unrelated code: fine
    validate_password_strength("correct horse battery staple")


# ---------------------------------------------------------------- rate limiter memory (F-ratelimit)
def test_the_rate_limiter_forgets_addresses_it_has_not_seen_for_a_window():
    limiter = InMemoryRateLimiter(max_requests=5, window_seconds=0.01)
    limiter._SWEEP_AT = 50  # noqa: SLF001 - keep the test small
    for i in range(200):
        limiter.check(f"ip-{i}")
    import time

    time.sleep(0.05)
    limiter.check("one-more")
    assert len(limiter._hits) < 60  # noqa: SLF001 - 200 stale keys were swept, not kept forever


# ---------------------------------------------------------------- attachments (F-attachments)
async def _owner_with_task(client, db_session):
    owner = await make_user(db_session, employee_code="SEC001", name="Owner", role="owner")
    headers = await login(client, employee_code="SEC001", password="InitialPass123!")
    task = await client.post(
        "/api/v1/tasks", json={"title": "T", "assigned_to": str(owner.id)}, headers=headers
    )
    return headers, task.json()["id"]


async def _upload(client, headers, task_id, name, content=PNG, mime="image/png"):
    return await client.post(
        "/api/v1/attachments",
        data={"entity_type": "task", "entity_id": task_id},
        files={"file": (name, io.BytesIO(content), mime)},
        headers=headers,
    )


@requires_db
async def test_hostile_filenames_are_cleaned_and_never_reach_the_storage_path(client, db_session):
    headers, task_id = await _owner_with_task(client, db_session)
    cases = {
        "../../evil.png": "evil.png",
        "a/b/c.png": "c.png",
        "C:\\win\\path.png": "path.png",
        "x?y=1#z.png": "x?y=1#z.png",  # legal in a filename; harmless because it is not a path
        "ünïcode-名前.png": "ünïcode-名前.png",
    }
    for sent, shown in cases.items():
        response = await _upload(client, headers, task_id, sent)
        assert response.status_code == 201, (sent, response.text)
        assert response.json()["original_filename"] == shown
        stored = (
            await db_session.execute(
                text("SELECT storage_path FROM attachments WHERE id = :i"),
                {"i": response.json()["id"]},
            )
        ).scalar_one()
        # exactly <type>/<record id>/<random uuid>.png - nothing the client chose is in the path
        assert re.fullmatch(rf"task/{task_id}/[0-9a-f-]{{36}}\.png", stored), stored


@requires_db
async def test_a_very_long_filename_is_shortened_not_a_server_error(client, db_session):
    headers, task_id = await _owner_with_task(client, db_session)
    response = await _upload(client, headers, task_id, "a" * 400 + ".png")
    assert response.status_code == 201
    assert len(response.json()["original_filename"]) <= 150
    assert response.json()["original_filename"].endswith(".png")


@requires_db
async def test_download_header_is_safe_for_any_name_and_forces_a_download(client, db_session):
    headers, task_id = await _owner_with_task(client, db_session)
    uploaded = await _upload(client, headers, task_id, "ünïcode-名前.png")
    download = await client.get(f"/api/v1/attachments/{uploaded.json()['id']}/download")
    assert download.status_code == 200
    disposition = download.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    assert disposition.isascii()  # a header value must survive Latin-1
    assert "filename*=UTF-8''%C3%BCn%C3%AFcode-%E5%90%8D%E5%89%8D.png" in disposition
    assert download.headers["x-content-type-options"] == "nosniff"
    assert download.content == PNG


@requires_db
async def test_an_oversized_upload_is_refused(client, db_session, monkeypatch):
    headers, task_id = await _owner_with_task(client, db_session)
    monkeypatch.setattr(
        "app.api.v1.endpoints.attachments.get_settings",
        lambda: type("S", (), {"attachment_max_size_bytes": 1024})(),
    )
    monkeypatch.setattr(
        "app.services.attachment_service.get_settings",
        lambda: type("S", (), {"attachment_max_size_bytes": 1024})(),
    )
    response = await _upload(client, headers, task_id, "big.txt", b"A" * 5000, "text/plain")
    assert response.status_code == 422


# ---------------------------------------------------------------- refresh-token reuse (F-refresh)
async def _login_and_cookie(client, code):
    await login(client, employee_code=code, password="InitialPass123!")
    return client.cookies.get("refresh_token")


@requires_db
async def test_a_stolen_refresh_token_replayed_after_rotation_ends_every_session(
    client, db_session
):
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    await make_user(db_session, employee_code="SEC010", name="Sam", role="employee")
    old = await _login_and_cookie(client, "SEC010")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 200  # legitimate rotation
    new = client.cookies.get("refresh_token")
    assert new != old

    # the rotated session row is aged past the grace period
    await db_session.execute(
        text("UPDATE sessions SET rotated_at = :t WHERE rotated_at IS NOT NULL"),
        {"t": datetime.now(UTC) - timedelta(minutes=5)},
    )
    await db_session.commit()

    # the thief presents the old token from another client
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as thief:
        thief.cookies.set("refresh_token", old, path="/api/v1/auth")
        assert (await thief.post("/api/v1/auth/refresh")).status_code == 401

    # ... and the real user's newer token no longer works either
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    live = (
        await db_session.execute(select(SessionModel).where(SessionModel.revoked_at.is_(None)))
    ).scalars().all()
    assert live == []
    audit = (
        await db_session.execute(
            text("SELECT count(*) FROM audit_logs WHERE action = 'user.refresh_token_reuse'")
        )
    ).scalar_one()
    assert audit == 1


@requires_db
async def test_a_racing_duplicate_refresh_within_the_grace_period_does_not_end_sessions(
    client, db_session
):
    await make_user(db_session, employee_code="SEC011", name="Rae", role="employee")
    old = await _login_and_cookie(client, "SEC011")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 200
    new = client.cookies.get("refresh_token")

    client.cookies.set("refresh_token", old, path="/api/v1/auth")  # a stale duplicate request
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    client.cookies.set("refresh_token", new, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 200  # the user is fine


# ---------------------------------------------------------------- database hardening (F-db)
@requires_db
async def test_every_security_definer_function_pins_its_search_path(db_session):
    rows = (
        await db_session.execute(
            text(
                """
                SELECT p.proname, p.proconfig FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.prosecdef
                """
            )
        )
    ).all()
    assert rows, "expected the SECURITY DEFINER helpers to exist"
    for name, config in rows:
        assert config and "search_path=public, pg_temp" in config, name


@requires_db
async def test_the_application_role_cannot_delete_history(db_session):
    rows = (
        await db_session.execute(
            text(
                """
                SELECT table_name FROM information_schema.role_table_grants
                WHERE grantee = 'hr_app_rls' AND table_schema = 'public'
                  AND privilege_type = 'DELETE'
                """
            )
        )
    ).scalars().all()
    # the only deleting code is the trigger that rebuilds the reporting-line closure
    assert set(rows) == {"manager_hierarchy_closure"}


# ------------------------------------------------------- Host-header path confusion (F-host)
# Starlette rebuilds `request.url` from the Host header, so a crafted Host can make
# `request.url.path` read "/api/v1/auth/me" while the router serves another endpoint. Anything that
# decides by path must use the matched path instead.
HOSTILE_HOST = "example.com/api/v1/auth/me?"


@requires_db
async def test_a_crafted_host_header_cannot_lift_the_temporary_password_restriction(
    client, db_session
):
    user = await make_user(db_session, employee_code="SEC020", name="Temp User", role="employee")
    await db_session.execute(
        text("UPDATE user_credentials SET must_reset = true WHERE user_id = :u"), {"u": user.id}
    )
    await db_session.commit()
    await login(client, employee_code="SEC020", password="InitialPass123!")

    plain = await client.get("/api/v1/tasks")
    assert plain.status_code == 403
    assert plain.json()["error"]["code"] == "password_change_required"
    crafted = await client.get("/api/v1/tasks", headers={"Host": HOSTILE_HOST})
    assert crafted.status_code == 403, "the restriction must not depend on the Host header"


async def test_a_crafted_host_header_does_not_reset_the_login_rate_limit(client):
    from app.core.config import get_settings

    limit = get_settings().login_rate_limit_max
    statuses = []
    for i in range(limit + 5):
        response = await client.post(
            "/api/v1/auth/login",
            json={"employee_code": "NOBODY", "password": "wrong-password"},
            headers={"Host": f"example.com/{i}?"},
        )
        statuses.append(response.status_code)
    assert 429 in statuses, "varying the Host header must not reset the per-endpoint rate limit"


# ---------------------------------------------------------------- audit trail coverage (F-audit)
@requires_db
async def test_attachments_and_catalogue_changes_leave_an_audit_trail(client, db_session):
    headers, task_id = await _owner_with_task(client, db_session)
    uploaded = await _upload(client, headers, task_id, "plan.png")
    assert (
        await client.delete(f"/api/v1/attachments/{uploaded.json()['id']}", headers=headers)
    ).status_code == 204
    customer = await client.post(
        "/api/v1/customers", json={"customer_code": "C-9", "name": "Acme"}, headers=headers
    )
    assert (
        await client.patch(
            f"/api/v1/customers/{customer.json()['id']}", json={"is_active": False}, headers=headers
        )
    ).status_code == 200
    actions = set(
        (await db_session.execute(text("SELECT action FROM audit_logs"))).scalars().all()
    )
    assert {"attachment.uploaded", "attachment.removed", "customer.deactivated"} <= actions


# ---------------------------------------------------------------- locked-out Owner (F-recovery)
@requires_db
async def test_a_locked_account_can_be_recovered_from_the_server(client, db_session):
    from scripts.recover_account import recover

    await make_user(db_session, employee_code="SEC030", name="Owner", role="owner")
    for _ in range(5):
        wrong = await client.post(
            "/api/v1/auth/login", json={"employee_code": "SEC030", "password": "not-the-password"}
        )
        assert wrong.status_code == 401
    locked = await client.post(
        "/api/v1/auth/login", json={"employee_code": "SEC030", "password": "InitialPass123!"}
    )
    assert locked.status_code == 401  # even the right password is refused while locked

    assert await recover("SEC030", reset_password=False) is None
    ok = await client.post(
        "/api/v1/auth/login", json={"employee_code": "SEC030", "password": "InitialPass123!"}
    )
    assert ok.status_code == 200

    temporary = await recover("SEC030", reset_password=True)
    assert temporary and len(temporary) >= 18
    assert (await client.get("/api/v1/auth/me")).status_code in (200, 401)
    fresh = await client.post(
        "/api/v1/auth/login", json={"employee_code": "SEC030", "password": temporary}
    )
    assert fresh.status_code == 200 and fresh.json()["must_reset"] is True
    assert await recover("NO-SUCH-CODE", reset_password=False) is False
