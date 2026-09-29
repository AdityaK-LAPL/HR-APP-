"""Service calls and the full chain: assignment, visits, reports.
See docs/database.md section 10 and context.md sections 16-23.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

CONTACT_METHODS = ("phone", "email", "in_person", "other")
SERVICE_TYPES = ("online_support", "phone_support", "remote_support", "field_visit", "other")
SERVICE_CALL_STATUSES = (
    "new",
    "assigned",
    "in_progress",
    "waiting_customer",
    "waiting_parts",
    "remote_support",
    "field_visit_scheduled",
    "field_visit_completed",
    "resolved",
    "closed",
    "reopened",
    "cancelled",
)
VISIT_TYPES = ("field_visit", "online_support")


class ServiceCall(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "service_calls"
    __table_args__ = (
        CheckConstraint(f"contact_method in {CONTACT_METHODS!r}", name="contact_method_valid"),
        CheckConstraint("priority in ('low','medium','high','urgent')", name="priority_valid"),
        CheckConstraint(f"service_type in {SERVICE_TYPES!r}", name="service_type_valid"),
        CheckConstraint(f"status in {SERVICE_CALL_STATUSES!r}", name="status_valid"),
    )

    service_call_code: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("machines.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    reported_by_contact_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("customer_contacts.id", ondelete="RESTRICT")
    )
    contacted_at: Mapped[datetime] = mapped_column(nullable=False)
    contact_method: Mapped[str] = mapped_column(String(20), nullable=False)
    issue_reported: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, server_default="medium")
    service_type: Mapped[str] = mapped_column(String(20), nullable=False)
    responsible_manager_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="new")
    resolution: Mapped[str | None] = mapped_column(Text)


class ServiceAssignment(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "service_assignments"

    service_call_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("service_calls.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    assigned_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    role_in_call: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    unassigned_at: Mapped[datetime | None] = mapped_column()


class ServiceVisit(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "service_visits"
    __table_args__ = (CheckConstraint(f"visit_type in {VISIT_TYPES!r}", name="visit_type_valid"),)

    service_call_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("service_calls.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    visit_type: Mapped[str] = mapped_column(String(20), nullable=False)
    visit_date: Mapped[date | None] = mapped_column(Date)
    arrival_time: Mapped[datetime | None] = mapped_column()
    departure_time: Mapped[datetime | None] = mapped_column()
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    work_performed: Mapped[str | None] = mapped_column(Text)
    problem_found: Mapped[str | None] = mapped_column(Text)
    parts_used: Mapped[str | None] = mapped_column(Text)
    action_taken: Mapped[str | None] = mapped_column(Text)
    result: Mapped[str | None] = mapped_column(Text)
    customer_signoff: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())


class ServiceReport(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "service_reports"

    service_call_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("service_calls.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    service_visit_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("service_visits.id", ondelete="RESTRICT")
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    report_datetime: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    service_type: Mapped[str | None] = mapped_column(String(20))
    work_performed: Mapped[str | None] = mapped_column(Text)
    problem_found: Mapped[str | None] = mapped_column(Text)
    root_cause: Mapped[str | None] = mapped_column(Text)
    action_taken: Mapped[str | None] = mapped_column(Text)
    parts_used: Mapped[str | None] = mapped_column(Text)
    result: Mapped[str | None] = mapped_column(Text)
    pending_work: Mapped[str | None] = mapped_column(Text)
    recommendations: Mapped[str | None] = mapped_column(Text)
    employee_comments: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column()
    submitted_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
