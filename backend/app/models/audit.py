"""Insert-only audit log.

Row mutation (UPDATE/DELETE) is blocked at the database level by a trigger
added in the Phase 2 migration - not just by omitting API routes for it -
so "audit history should not be casually editable" (context.md section 24)
holds even against a bug elsewhere in the app.
"""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class AuditLog(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "audit_logs"

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    old_value: Mapped[dict | None] = mapped_column(JSONB)
    new_value: Mapped[dict | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), index=True
    )
