"""Customer-owned machines. See docs/database.md section 10.

`created_by` mirrors the same addition made to `customers` - see
app/models/customer.py.
"""

import uuid
from datetime import date

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

MACHINE_STATUSES = ("active", "inactive", "decommissioned")


class Machine(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "machines"
    __table_args__ = (CheckConstraint(f"status in {MACHINE_STATUSES!r}", name="status_valid"),)

    machine_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    model_name: Mapped[str | None] = mapped_column(String(200))
    serial_number: Mapped[str | None] = mapped_column(String(100), unique=True, index=True)
    installation_date: Mapped[date | None] = mapped_column(Date)
    purchase_info: Mapped[str | None] = mapped_column(Text)
    warranty_info: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="active")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )
