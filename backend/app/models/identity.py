"""Identity, credentials, sessions, and the manager-hierarchy closure table.

See docs/database.md sections 3-4 for the design rationale, and
docs/permissions.md section 2 for how manager_hierarchy_closure is
maintained and used.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role in ('owner','manager','employee')", name="role_valid"),)

    employee_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    designation: Mapped[str | None] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    manager_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    deactivated_at: Mapped[datetime | None] = mapped_column()
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )

    manager: Mapped["User | None"] = relationship(
        "User", remote_side="User.id", foreign_keys=[manager_id]
    )


class UserCredentials(Base):
    __tablename__ = "user_credentials"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    must_reset: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    password_changed_at: Mapped[datetime | None] = mapped_column()
    failed_attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column()


class Session(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    refresh_token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    user_agent: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column()
    # Set when the refresh token was *used* (swapped for a new one), as opposed to being revoked by
    # a sign-out or password change. Presenting such a token again means two parties hold it.
    rotated_at: Mapped[datetime | None] = mapped_column()


class ManagerHierarchyClosure(Base):
    """Materialized transitive closure of `users.manager_id`.

    Maintained entirely by database triggers (see the Phase 2 migration) -
    never written to directly by the application. depth=0 is the self row
    (every user is their own descendant at depth 0).
    """

    __tablename__ = "manager_hierarchy_closure"

    ancestor_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    descendant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    depth: Mapped[int] = mapped_column(Integer, nullable=False)
