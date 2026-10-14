"""Leave requests and their approval trail. See docs/database.md section 7.

`leave_approvals` supports a multi-step chain (`sequence`) even though the
Phase 3 workflow implemented in app/services/leave_service.py only uses a
single step (the employee's direct manager) - see docs/architecture.md
section 11, open question 3.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

LEAVE_STATUSES = ("pending", "approved", "rejected", "cancelled")
LEAVE_DECISIONS = ("approved", "rejected")
LEAVE_KINDS = ("full_day", "half_day", "comp_off")


class LeaveRequest(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "leave_requests"
    __table_args__ = (
        CheckConstraint(f"status in {LEAVE_STATUSES!r}", name="status_valid"),
        CheckConstraint(f"leave_kind in {LEAVE_KINDS!r}", name="leave_kind_valid"),
        CheckConstraint(
            "leave_kind <> 'half_day' or start_date = end_date", name="half_day_is_one_day"
        ),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")
    # full_day = the whole range counts; half_day = one date, counts 0.5; comp_off = a day taken in
    # lieu of weekly-off / holiday working, counts 0.
    leave_kind: Mapped[str] = mapped_column(String(20), nullable=False, server_default="full_day")
    current_approver_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )


class LeaveApproval(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "leave_approvals"
    __table_args__ = (CheckConstraint(f"decision in {LEAVE_DECISIONS!r}", name="decision_valid"),)

    leave_request_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("leave_requests.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    approver_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    comments: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
