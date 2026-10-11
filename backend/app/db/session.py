"""Async database engine/session management.

Exposes a FastAPI dependency (`get_db`) that yields one `AsyncSession` per
request and commits/rolls back around it. `set_rls_context` is used by the
authentication dependency (added in Phase 2) to tell PostgreSQL Row Level
Security who the current caller is, on the same transaction that will run
the request's queries - see docs/permissions.md section 6.
"""

from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

_settings = get_settings()

engine: AsyncEngine = create_async_engine(
    _settings.database_url,
    echo=_settings.debug,
    pool_pre_ping=True,
    pool_size=_settings.db_pool_size,
    max_overflow=_settings.db_max_overflow,
    connect_args={
        "command_timeout": _settings.db_command_timeout_seconds,
        "timeout": _settings.db_connect_timeout_seconds,
    },
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def set_rls_context(session: AsyncSession, user_id: str | None, role: str | None) -> None:
    """Set the per-transaction GUCs that RLS policies read.

    Uses `set_config(..., is_local=true)` rather than `SET LOCAL app.x = :x`:
    `SET` is parsed as SQL syntax, not a function call, so PostgreSQL can't
    bind a protocol-level parameter into it - asyncpg (unlike psycopg2, which
    substitutes client-side) sends parameters over the wire and fails with a
    syntax error. `set_config` is an ordinary function call and takes bind
    parameters normally, while still being local-to-transaction via its
    third argument.
    """

    if _settings.app_db_role:
        # Drop BYPASSRLS for this transaction: the connecting role skips RLS, the
        # application role does not. Transaction-local, like the GUCs below.
        await session.execute(
            text("SELECT set_config('role', :role, true)"), {"role": _settings.app_db_role}
        )
    await session.execute(
        text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_id or ""}
    )
    await session.execute(
        text("SELECT set_config('app.user_role', :role, true)"), {"role": role or ""}
    )


async def check_database_connection() -> bool:
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))
    return True
