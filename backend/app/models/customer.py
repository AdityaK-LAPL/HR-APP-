"""Customers and their contacts. See docs/database.md section 10.

`created_by` is not in the original design sketch - it was added to make
edit-scoping possible for a customer that has no service call yet (a
newly-created customer's creator must be able to edit it before any call
exists to derive scope from) - see docs/api-contract.md section 10 and the
Open Question 2 resolution in docs/development-status.md.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Customer(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "customers"

    customer_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    address: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )


class CustomerContact(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "customer_contacts"

    customer_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    designation: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(200))
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
