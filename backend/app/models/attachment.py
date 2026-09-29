"""Polymorphic file attachments. See docs/database.md section 11.

`entity_id` has no DB-level FK (it can point at any of several tables), so
referential integrity for it is enforced entirely in
app/services/attachment_service.py, not by the database - matching the
design note in database.md.

`is_active` is not in the original design sketch - added because
`DELETE /attachments/{id}` is documented (api-contract.md section 15) as a
soft-remove ("hide from listings; retained in storage/audit unless Owner
purges"), which needs a flag to represent.
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin

ATTACHABLE_ENTITY_TYPES = (
    "task",
    "eod_report",
    "project",
    "customer",
    "machine",
    "service_call",
    "service_report",
)


class Attachment(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "attachments"
    __table_args__ = (
        CheckConstraint(f"entity_type in {ATTACHABLE_ENTITY_TYPES!r}", name="entity_type_valid"),
    )

    entity_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
