"""Projects and project membership. See docs/database.md section 6."""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

PROJECT_STATUSES = ("not_started", "planning", "in_progress", "on_hold", "completed", "cancelled")


class Project(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "projects"
    __table_args__ = (CheckConstraint(f"status in {PROJECT_STATUSES!r}", name="status_valid"),)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    owning_manager_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="not_started")
    start_date: Mapped[date | None] = mapped_column(Date)
    expected_end_date: Mapped[date | None] = mapped_column(Date)
    actual_end_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class ProjectMember(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "project_members"
    __table_args__ = (
        # Partial unique index (not a blanket UniqueConstraint): a user can
        # be removed from a project (is_active=false) and later re-added,
        # which must create a new row, not violate uniqueness - only one
        # *active* membership per (project, user) at a time.
        Index(
            "uq_project_members_active_project_user",
            "project_id",
            "user_id",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    role_in_project: Mapped[str | None] = mapped_column(String(100))
    assigned_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
