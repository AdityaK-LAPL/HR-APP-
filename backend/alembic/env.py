"""Alembic environment.

Runs migrations using the same async engine configuration as the app
(`app.core.config.get_settings`), so there is a single source of truth for
the database URL - no separate sync driver/connection string to keep in
sync. Follows SQLAlchemy's documented async-Alembic pattern (run_sync).
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings
from app.db.base import Base
from app.models import (  # noqa: F401
    attachment,
    attendance,
    audit,
    customer,
    eod,
    identity,
    leave,
    machine,
    notification,
    permission,
    project,
    service,
    task,
)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

settings = get_settings()
# ConfigParser's default interpolation treats "%" as special syntax, which
# breaks when the URL contains a percent-encoded password (e.g. "%40" for
# "@"). Escaping to "%%" round-trips correctly through get_main_option.
config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
