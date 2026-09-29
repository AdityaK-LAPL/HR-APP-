"""Owner-facing permission grant management - see docs/permissions.md section 4."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, NotFoundError, ValidationFailedError
from app.models.identity import User
from app.models.permission import PermissionDefinition, PermissionGrant
from app.schemas.permission import PermissionGrantCreateRequest
from app.schemas.principal import CurrentUser
from app.services.audit_service import record_audit_log


async def list_definitions(db: AsyncSession) -> list[PermissionDefinition]:
    stmt = select(PermissionDefinition).order_by(PermissionDefinition.key)
    return list((await db.execute(stmt)).scalars().all())


async def list_grants(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    grantee_user_id: uuid.UUID | None,
    permission_key: str | None,
    scope_type: str | None,
) -> list[PermissionGrant]:
    if actor.role != "owner":
        raise AuthorizationError("Only the Owner can view permission grants.")

    stmt = select(PermissionGrant).where(PermissionGrant.revoked_at.is_(None))
    if grantee_user_id is not None:
        stmt = stmt.where(PermissionGrant.grantee_user_id == grantee_user_id)
    if permission_key is not None:
        stmt = stmt.where(PermissionGrant.permission_key == permission_key)
    if scope_type is not None:
        stmt = stmt.where(PermissionGrant.scope_type == scope_type)
    stmt = stmt.order_by(PermissionGrant.created_at.desc())
    return list((await db.execute(stmt)).scalars().all())


async def create_grant(
    db: AsyncSession, *, actor: CurrentUser, payload: PermissionGrantCreateRequest
) -> PermissionGrant:
    if actor.role != "owner":
        raise AuthorizationError("Only the Owner can create permission grants.")

    grantee = (
        await db.execute(select(User).where(User.id == payload.grantee_user_id))
    ).scalar_one_or_none()
    if grantee is None:
        raise ValidationFailedError("grantee_user_id does not reference an existing user.")

    definition = (
        await db.execute(
            select(PermissionDefinition).where(PermissionDefinition.key == payload.permission_key)
        )
    ).scalar_one_or_none()
    if definition is None:
        raise ValidationFailedError("permission_key does not reference a known permission.")

    grant = PermissionGrant(
        grantee_user_id=payload.grantee_user_id,
        permission_key=payload.permission_key,
        scope_type=payload.scope_type,
        scope_id=payload.scope_id,
        effect=payload.effect,
        granted_by=actor.id,
        expires_at=payload.expires_at,
    )
    db.add(grant)
    await db.flush()

    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="permission.granted",
        entity_type="permission_grant",
        entity_id=grant.id,
        new_value={
            "grantee_user_id": str(grant.grantee_user_id),
            "permission_key": grant.permission_key,
            "scope_type": grant.scope_type,
            "scope_id": str(grant.scope_id) if grant.scope_id else None,
            "effect": grant.effect,
        },
    )
    await db.flush()
    return grant


async def revoke_grant(db: AsyncSession, *, actor: CurrentUser, grant_id: uuid.UUID) -> None:
    if actor.role != "owner":
        raise AuthorizationError("Only the Owner can revoke permission grants.")

    grant = (
        await db.execute(select(PermissionGrant).where(PermissionGrant.id == grant_id))
    ).scalar_one_or_none()
    if grant is None:
        raise NotFoundError("Permission grant not found.")
    if grant.revoked_at is not None:
        return

    grant.revoked_at = datetime.now(UTC)
    await db.flush()

    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="permission.revoked",
        entity_type="permission_grant",
        entity_id=grant.id,
    )
    await db.flush()
