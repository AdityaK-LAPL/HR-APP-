"""Shared SQLAlchemy model mixins.

Every table in this schema uses a UUID primary key (IDs are exposed in API
URLs; UUIDs avoid leaking record counts) and created_at/updated_at
timestamps - see docs/database.md section 1 for the full rationale.
`updated_at` is also maintained by a DB-level trigger (see the Phase 2
migration) so it stays correct even for updates issued outside the ORM.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )


class TimestampMixin:
    # `updated_at` is set by a SQL expression on UPDATE, so SQLAlchemy would
    # otherwise expire it after the flush; reading it later (e.g. when
    # serializing the response) then attempts a lazy load, which async
    # sessions forbid (MissingGreenlet). eager_defaults fetches server-side
    # values via RETURNING on INSERT and UPDATE instead.
    __mapper_args__ = {"eager_defaults": True}

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
