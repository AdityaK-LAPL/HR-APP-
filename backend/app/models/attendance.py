"""Attendance events and the derived daily summary. See docs/database.md
section 9.

`work_date` is the event's calendar date in the company timezone (Asia/Kolkata by
default, app/core/company_time.py); timestamps are UTC instants.
Location is captured only at the moment of a punch event, never polled
continuously, per context.md section 4.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin

ATTENDANCE_EVENT_TYPES = ("punch_in", "punch_out")
ATTENDANCE_STATUSES = ("present", "partial", "absent", "on_leave")
WORK_MODES = ("at_office", "work_from_home", "on_duty")


class AttendanceEvent(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "attendance_events"
    __table_args__ = (
        CheckConstraint(f"event_type in {ATTENDANCE_EVENT_TYPES!r}", name="event_type_valid"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(20), nullable=False)
    event_time: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    location_label: Mapped[str | None] = mapped_column(Text)
    device_info: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())


class AttendanceDay(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "attendance_days"
    __table_args__ = (
        CheckConstraint(f"status in {ATTENDANCE_STATUSES!r}", name="status_valid"),
        CheckConstraint(
            f"work_mode is null or work_mode in {WORK_MODES!r}", name="work_mode_valid"
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    punch_in_time: Mapped[datetime | None] = mapped_column()
    punch_in_location: Mapped[str | None] = mapped_column(Text)
    punch_out_time: Mapped[datetime | None] = mapped_column()
    punch_out_location: Mapped[str | None] = mapped_column(Text)
    total_duration_minutes: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="present")
    # Chosen at punch-in: where the person is working today, plus a remark ("KSB Coimbatore").
    work_mode: Mapped[str | None] = mapped_column(String(20))
    remark: Mapped[str | None] = mapped_column(Text)
