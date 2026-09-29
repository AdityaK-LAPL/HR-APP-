"""Manager-hierarchy management - Owner-only. See docs/permissions.md section 2.

The actual cycle rejection and manager_hierarchy_closure maintenance happen
in database triggers (Phase 2 migration), fired by the UPDATE this module
issues - this module's own job is authorization, the "manager must exist
and be active" business rule, and the audit trail.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, NotFoundError, ValidationFailedError
from app.models.identity import ManagerHierarchyClosure, User
from app.schemas.principal import CurrentUser
from app.services.audit_service import record_audit_log


async def reassign_manager(
    db: AsyncSession, *, actor: CurrentUser, user_id: uuid.UUID, new_manager_id: uuid.UUID | None
) -> User:
    if actor.role != "owner":
        raise AuthorizationError("Only the Owner can change the reporting hierarchy.")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise NotFoundError("User not found.")

    if new_manager_id is not None:
        if new_manager_id == user_id:
            raise ValidationFailedError("A user cannot be their own manager.")
        new_manager = (
            await db.execute(select(User).where(User.id == new_manager_id))
        ).scalar_one_or_none()
        if new_manager is None or not new_manager.is_active:
            raise ValidationFailedError("manager_id does not reference an active user.")
        if new_manager.role not in ("owner", "manager"):
            raise ValidationFailedError("The assigned manager must have the manager or owner role.")

    old_manager_id = user.manager_id
    if old_manager_id == new_manager_id:
        return user

    user.manager_id = new_manager_id
    try:
        await db.flush()
    except (IntegrityError, DBAPIError) as exc:
        await db.rollback()
        raise ValidationFailedError(
            "This change would create a cycle in the reporting hierarchy."
        ) from exc

    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="user.manager_changed",
        entity_type="user",
        entity_id=user.id,
        old_value={"manager_id": str(old_manager_id) if old_manager_id else None},
        new_value={"manager_id": str(new_manager_id) if new_manager_id else None},
    )
    await db.flush()
    return user


async def get_hierarchy(
    db: AsyncSession, *, actor: CurrentUser, root_user_id: uuid.UUID | None
) -> list[User]:
    if actor.role == "owner":
        if root_user_id is None:
            return list((await db.execute(select(User).order_by(User.name))).scalars().all())
        effective_root = root_user_id
    else:
        effective_root = actor.id

    stmt = (
        select(User)
        .join(ManagerHierarchyClosure, ManagerHierarchyClosure.descendant_id == User.id)
        .where(ManagerHierarchyClosure.ancestor_id == effective_root)
        .order_by(User.name)
    )
    return list((await db.execute(stmt)).scalars().all())
