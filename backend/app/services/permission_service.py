"""Server-side permission evaluator - see docs/permissions.md section 5.

Two entry points:
- `in_scope`: the default hierarchy rule (self or a descendant in the
  manager hierarchy). This is what lets a Manager see their subtree's data
  without needing any explicit grant.
- `has_permission`: the full deny > allow > hierarchy > role-default
  evaluation for a *named* permission (the Owner-configurable exceptions in
  docs/permissions.md section 4), used for cross-branch/cross-manager cases.

`actor` must always come from the authenticated session (see
app/api/deps.py) - this module never trusts a role or user id supplied by
the caller, and always re-checks against the database.
"""

import uuid
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import ManagerHierarchyClosure
from app.models.permission import PermissionGrant, RolePermission
from app.schemas.principal import CurrentUser


async def in_scope(db: AsyncSession, actor: CurrentUser, target_user_id: uuid.UUID) -> bool:
    """Owner sees everyone; anyone sees themselves; a Manager sees their subtree."""

    if actor.role == "owner":
        return True
    if target_user_id == actor.id:
        return True

    stmt = select(ManagerHierarchyClosure.depth).where(
        ManagerHierarchyClosure.ancestor_id == actor.id,
        ManagerHierarchyClosure.descendant_id == target_user_id,
    )
    result = await db.execute(stmt)
    return result.first() is not None


VisibilityKind = Literal["team", "reports", "calendar"]


def visible_user_ids(kind: VisibilityKind):
    """Subquery of the user ids whose data of `kind` the caller (per the request's RLS
    context) may read: self, the reporting subtree, plus subtrees of explicit
    view_manager_* allow grants, minus explicit deny grants. Evaluated by the database
    (`app_visible_user_ids`, migration 0016) so the service layer and RLS cannot disagree.
    `team` = view_manager_team (profiles/hierarchy); `reports` = view_manager_reports (EOD,
    tasks, attendance); `calendar` = view_subordinate_manager_calendar."""

    return select(func.app_visible_user_ids(kind).column_valued("visible_user_id"))


async def can_view_user(
    db: AsyncSession, actor: CurrentUser, target_user_id: uuid.UUID, kind: VisibilityKind
) -> bool:
    if actor.role == "owner" or target_user_id == actor.id:
        return True
    column = func.app_visible_user_ids(kind).column_valued("visible_user_id")
    stmt = select(column).where(column == target_user_id)
    return (await db.execute(stmt)).first() is not None


async def has_permission(
    db: AsyncSession,
    actor: CurrentUser,
    permission_key: str,
    *,
    scope_type: str,
    scope_id: uuid.UUID | None,
) -> bool:
    if actor.role == "owner":
        return True

    now = datetime.now(UTC)
    not_expired = or_(PermissionGrant.expires_at.is_(None), PermissionGrant.expires_at > now)

    deny_stmt = select(PermissionGrant.id).where(
        PermissionGrant.grantee_user_id == actor.id,
        PermissionGrant.permission_key == permission_key,
        PermissionGrant.scope_type == scope_type,
        PermissionGrant.scope_id == scope_id,
        PermissionGrant.effect == "deny",
        PermissionGrant.revoked_at.is_(None),
        not_expired,
    )
    if (await db.execute(deny_stmt)).first() is not None:
        return False

    allow_stmt = select(PermissionGrant.id).where(
        PermissionGrant.grantee_user_id == actor.id,
        PermissionGrant.permission_key == permission_key,
        PermissionGrant.scope_type == scope_type,
        PermissionGrant.scope_id == scope_id,
        PermissionGrant.effect == "allow",
        PermissionGrant.revoked_at.is_(None),
        not_expired,
    )
    if (await db.execute(allow_stmt)).first() is not None:
        return True

    if scope_type == "user" and scope_id is not None and await in_scope(db, actor, scope_id):
        return True

    role_stmt = select(RolePermission.allow).where(
        RolePermission.role == actor.role, RolePermission.permission_key == permission_key
    )
    result = (await db.execute(role_stmt)).scalar_one_or_none()
    return bool(result)
