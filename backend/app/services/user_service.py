"""User management business logic: create, read, list, update.

See docs/api-contract.md section 2 for the permission rule each function
enforces. manager_id changes are handled exclusively by
app/services/hierarchy_service.py, not here.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, ConflictError, NotFoundError
from app.core.security import hash_password, validate_password_strength
from app.models.identity import ManagerHierarchyClosure, User, UserCredentials
from app.schemas.principal import CurrentUser
from app.schemas.user import UserCreateRequest, UserUpdateRequest
from app.services.audit_service import record_audit_log
from app.services.permission_service import can_view_user, in_scope, visible_user_ids
from app.services.search import ESCAPE, like_pattern


async def create_user(db: AsyncSession, *, actor: CurrentUser, payload: UserCreateRequest) -> User:
    if actor.role != "owner":
        raise AuthorizationError("Only the Owner can create new users.")

    if payload.manager_id is not None:
        manager = (
            await db.execute(select(User).where(User.id == payload.manager_id))
        ).scalar_one_or_none()
        if manager is None or not manager.is_active:
            raise ConflictError("manager_id does not reference an active user.")

    existing = (
        await db.execute(select(User).where(User.employee_code == payload.employee_code))
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictError("employee_code is already in use.")

    validate_password_strength(payload.initial_password, employee_code=payload.employee_code)

    user = User(
        employee_code=payload.employee_code,
        name=payload.name,
        designation=payload.designation,
        role=payload.role,
        manager_id=payload.manager_id,
        created_by=actor.id,
    )
    db.add(user)
    await db.flush()

    credentials = UserCredentials(
        user_id=user.id,
        password_hash=hash_password(payload.initial_password),
        must_reset=True,
        password_changed_at=datetime.now(UTC),
    )
    db.add(credentials)

    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="user.created",
        entity_type="user",
        entity_id=user.id,
        new_value={
            "employee_code": user.employee_code,
            "name": user.name,
            "role": user.role,
            "manager_id": str(user.manager_id) if user.manager_id else None,
        },
    )
    await db.flush()
    return user


async def get_user(db: AsyncSession, *, actor: CurrentUser, user_id: uuid.UUID) -> User:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise NotFoundError("User not found.")
    if not await can_view_user(db, actor, user_id, "team"):
        raise AuthorizationError("You do not have permission to view this user.")
    return user


async def list_users(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    manager_id: uuid.UUID | None,
    role: str | None,
    is_active: bool | None,
    search: str | None,
    page: int,
    page_size: int,
) -> tuple[list[User], int]:
    stmt = select(User)

    if actor.role == "owner":
        pass
    elif actor.role == "manager":
        stmt = stmt.where(User.id.in_(visible_user_ids("team")))
    else:
        stmt = stmt.where(User.id == actor.id)

    if manager_id is not None:
        stmt = stmt.where(User.manager_id == manager_id)
    if role is not None:
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    if search:
        pattern = like_pattern(search)
        stmt = stmt.where(
            User.name.ilike(pattern, escape=ESCAPE)
            | User.employee_code.ilike(pattern, escape=ESCAPE)
            | User.designation.ilike(pattern, escape=ESCAPE)
        )

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

    stmt = stmt.order_by(User.name).offset((page - 1) * page_size).limit(page_size)
    users = (await db.execute(stmt)).scalars().all()
    return list(users), total


async def get_subordinates(
    db: AsyncSession, *, actor: CurrentUser, user_id: uuid.UUID
) -> list[User]:
    if actor.role == "employee" and user_id != actor.id:
        raise AuthorizationError("You may only view your own subordinates.")
    if not await can_view_user(db, actor, user_id, "team"):
        raise AuthorizationError("You may only view the teams you have been given access to.")
    stmt = (
        select(User)
        .join(ManagerHierarchyClosure, ManagerHierarchyClosure.descendant_id == User.id)
        .where(ManagerHierarchyClosure.ancestor_id == user_id, ManagerHierarchyClosure.depth > 0)
        .order_by(User.name)
    )
    return list((await db.execute(stmt)).scalars().all())


async def update_user(
    db: AsyncSession, *, actor: CurrentUser, user_id: uuid.UUID, payload: UserUpdateRequest
) -> User:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise NotFoundError("User not found.")

    is_owner = actor.role == "owner"
    is_self = actor.id == user_id

    if not is_owner:
        if payload.role is not None or payload.is_active is not None:
            raise AuthorizationError("Only the Owner can change role or active status.")
        if not is_self and not (actor.role == "manager" and await in_scope(db, actor, user_id)):
            raise AuthorizationError("You do not have permission to edit this user.")

    old_value = {
        "name": user.name,
        "designation": user.designation,
        "role": user.role,
        "is_active": user.is_active,
    }

    if payload.name is not None:
        user.name = payload.name
    if payload.designation is not None:
        user.designation = payload.designation
    if is_owner and payload.role is not None:
        user.role = payload.role
    if is_owner and payload.is_active is not None:
        user.is_active = payload.is_active
        user.deactivated_at = None if payload.is_active else datetime.now(UTC)

    await db.flush()

    new_value = {
        "name": user.name,
        "designation": user.designation,
        "role": user.role,
        "is_active": user.is_active,
    }
    if old_value != new_value:
        action = (
            "user.deactivated"
            if old_value["is_active"] and not new_value["is_active"]
            else "user.modified"
        )
        await record_audit_log(
            db,
            actor_user_id=actor.id,
            action=action,
            entity_type="user",
            entity_id=user.id,
            old_value=old_value,
            new_value=new_value,
        )
        await db.flush()

    return user
