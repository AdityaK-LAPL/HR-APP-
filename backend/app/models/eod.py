"""EOD (End Of Day) reports. See docs/database.md section 8.

No update endpoint exists (see docs/api-contract.md section 7) - once
submitted, a report is a historical record, matching context.md section
3.3's "the system should maintain historical EOD reports."
"""

import uuid
from datetime import date, datetime

from sqlalchemy import ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Date

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class EodReport(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "eod_reports"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    report_date: Mapped[date] = mapped_column(Date, nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("projects.id", ondelete="RESTRICT"), index=True
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="RESTRICT")
    )
    work_completed: Mapped[str | None] = mapped_column(Text)
    work_remaining: Mapped[str | None] = mapped_column(Text)
    issues: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
