"""Shared pytest fixtures.

Sets safe, non-production defaults for required settings *before* the app
module is imported, so the test suite never needs a real .env file to at
least import the app and exercise non-database endpoints.

Tests that need a real database are marked `requires_db` and skip cleanly
(rather than failing obscurely) when DATABASE_URL isn't reachable. Before
running them against a real database, apply migrations first:

    alembic upgrade head

`db_reset` then TRUNCATEs the per-test-mutable tables (not the
permission_definitions/role_permissions catalog, which migrations seed
once and tests should treat as fixed reference data) before each test that
depends on it, so tests don't leak state into one another.
"""

import asyncio
import os
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path

import tests._production_guard  # noqa: F401  (must run before ENVIRONMENT is defaulted below)

os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/company_app_test"
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-not-for-production-use")
os.environ.setdefault("ENVIRONMENT", "test")

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.rate_limit import reset_rate_limits
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal, engine, set_rls_context
from app.main import app
from app.models.identity import User, UserCredentials

TRUNCATE_TABLES = (
    "attachments",
    "notifications",
    "service_reports",
    "service_visits",
    "service_assignments",
    "service_calls",
    "machines",
    "customer_contacts",
    "customers",
    "attendance_events",
    "attendance_days",
    "eod_reports",
    "leave_approvals",
    "leave_requests",
    "project_members",
    "task_history",
    "tasks",
    "projects",
    "permission_grants",
    "audit_logs",
    "sessions",
    "manager_hierarchy_closure",
    "user_credentials",
    "company_holidays",
    "users",
)


def _check_db_reachable() -> bool:
    async def _check() -> bool:
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False
        finally:
            # This runs in a throwaway event loop; a connection left pooled
            # here would be bound to that dead loop and hold a pooler slot.
            await engine.dispose()

    return asyncio.run(_check())


DB_AVAILABLE = _check_db_reachable()
requires_db = pytest.mark.skipif(
    not DB_AVAILABLE,
    reason="No reachable test database (set DATABASE_URL and run `alembic upgrade head`)",
)


@pytest.fixture(scope="session", autouse=True)
async def _dispose_engine_at_session_end():
    # Supabase's pooled connection modes cap concurrent client connections
    # per project on a shared, fairly low limit; disposing the engine here
    # closes every pooled connection explicitly instead of leaving them for
    # the pooler to eventually reap, which would otherwise count against
    # that cap for a following run.
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    # The login/refresh rate limiter (app/core/rate_limit.py) is a
    # process-wide singleton; without resetting it, one test's login
    # attempts would count against a later, unrelated test's.
    reset_rate_limits()
    yield


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def db_reset():
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {', '.join(TRUNCATE_TABLES)} RESTART IDENTITY CASCADE"))
        # Truncating users cascades to company_settings (updated_by); a real database always holds
        # its single row, so put it back with the defaults.
        await conn.execute(
            text("INSERT INTO company_settings (id) VALUES (1) ON CONFLICT DO NOTHING")
        )

    # Local-filesystem attachment storage (app/services/storage.py) isn't
    # database-tracked, so it needs its own cleanup between tests.
    storage_dir = Path(get_settings().local_storage_dir)
    if storage_dir.exists():
        shutil.rmtree(storage_dir)

    yield

    await _delete_uploaded_supabase_objects()


async def _delete_uploaded_supabase_objects() -> None:
    """Remove the objects a test uploaded to the real Supabase bucket.

    `attachments.storage_path` still holds every path at this point (the
    table is only truncated at the start of the next test), so the bucket
    doesn't accumulate test files. No-op when using local storage.
    """

    settings = get_settings()
    if not settings.use_supabase_storage:
        return

    async with engine.connect() as conn:
        rows = await conn.execute(text("SELECT storage_path FROM attachments"))
        paths = [row[0] for row in rows]
    if not paths:
        return

    base = settings.supabase_url.rstrip("/")
    key = settings.supabase_service_role_key
    async with httpx.AsyncClient(timeout=30) as http:
        response = await http.request(
            "DELETE",
            f"{base}/storage/v1/object/{settings.supabase_storage_bucket}",
            headers={"Authorization": f"Bearer {key}", "apikey": key},
            json={"prefixes": paths},
        )
        response.raise_for_status()


@pytest.fixture
async def db_session(db_reset):
    async with AsyncSessionLocal() as session:
        yield session
        await session.rollback()


async def make_user(
    db: AsyncSession,
    *,
    employee_code: str,
    name: str,
    role: str,
    manager_id: uuid.UUID | None = None,
    password: str = "InitialPass123!",
    is_active: bool = True,
) -> User:
    """Test-only helper: creates a user + credentials directly via the ORM,
    bypassing the API layer for fast fixture setup. Runs under the
    'system' RLS context, the same reserved bootstrap role the app itself
    uses for login (see docs/permissions.md section 6)."""

    await set_rls_context(db, user_id=None, role="system")
    user = User(
        employee_code=employee_code,
        name=name,
        role=role,
        manager_id=manager_id,
        is_active=is_active,
    )
    db.add(user)
    await db.flush()
    db.add(
        UserCredentials(
            user_id=user.id,
            password_hash=hash_password(password),
            password_changed_at=datetime.now(UTC),
        )
    )
    await db.flush()
    await db.commit()
    return user


async def login(client, *, employee_code: str, password: str) -> dict:
    """Logs in on the given test client and returns headers with the CSRF
    token that must accompany subsequent mutating (POST/PATCH/DELETE)
    requests on the same client - see docs/api-contract.md Conventions."""

    response = await client.post(
        "/api/v1/auth/login", json={"employee_code": employee_code, "password": password}
    )
    assert response.status_code == 200, response.text
    token = client.cookies.get("csrf_token")
    return {"X-CSRF-Token": token} if token else {}
