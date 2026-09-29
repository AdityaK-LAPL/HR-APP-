"""In-app notifications. See docs/database.md section 11 and
docs/api-contract.md section 17. Only in-app delivery is built - the
architecture leaves room for push/email/WhatsApp channels later without a
schema change (context.md section 28).
"""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class Notification(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "notifications"

    recipient_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONB)
    read_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
