"""Permission catalog, role defaults, and Owner-configured overrides.

See docs/permissions.md sections 3-5 for the full evaluation algorithm this
schema supports.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class PermissionDefinition(Base):
    __tablename__ = "permission_definitions"
    __table_args__ = (
        CheckConstraint(
            "applies_to_role in ('manager','employee','any')", name="applies_to_role_valid"
        ),
    )

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    description: Mapped[str | None] = mapped_column(Text)
    applies_to_role: Mapped[str] = mapped_column(String(20), nullable=False)


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (CheckConstraint("role in ('owner','manager','employee')", name="role_valid"),)

    role: Mapped[str] = mapped_column(String(20), primary_key=True)
    permission_key: Mapped[str] = mapped_column(
        String(100), ForeignKey("permission_definitions.key", ondelete="CASCADE"), primary_key=True
    )
    allow: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


class PermissionGrant(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "permission_grants"
    __table_args__ = (
        CheckConstraint(
            "scope_type in ('user','team','project','global')", name="scope_type_valid"
        ),
        CheckConstraint("effect in ('allow','deny')", name="effect_valid"),
    )

    grantee_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    permission_key: Mapped[str] = mapped_column(
        String(100), ForeignKey("permission_definitions.key", ondelete="RESTRICT"), nullable=False
    )
    scope_type: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    effect: Mapped[str] = mapped_column(String(10), nullable=False)
    granted_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column()
