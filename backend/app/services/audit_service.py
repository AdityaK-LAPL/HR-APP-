"""Audit log writer and reader.

Every service layer calls `record_audit_log` for the actions listed in
context.md section 24 / docs/database.md section 11. Rows are insert-only -
see app/models/audit.py and the Phase 2 migration's immutability trigger.
`list_audit_logs` backs the Owner-only `GET /audit-logs` endpoint added in
Phase 6 (docs/api-contract.md section 16) - Managers see the same
information through entity-specific history endpoints instead (e.g.
`GET /tasks/{id}/history`), not raw audit access.
"""

import uuid
from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError
from app.models.audit import AuditLog
from app.schemas.principal import CurrentUser


async def record_audit_log(
    db: AsyncSession,
    *,
    actor_user_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    log = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
    )
    db.add(log)
    await db.flush()
    return log


async def list_audit_logs(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    entity_type: str | None,
    entity_id: uuid.UUID | None,
    actor_user_id: uuid.UUID | None,
    action: str | None,
    start_date: date | None,
    end_date: date | None,
    page: int,
    page_size: int,
) -> tuple[list[AuditLog], int]:
    if actor.role != "owner":
        raise AuthorizationError("Only the Owner can view raw audit logs.")

    stmt = select(AuditLog)
    if entity_type is not None:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if actor_user_id is not None:
        stmt = stmt.where(AuditLog.actor_user_id == actor_user_id)
    if action is not None:
        stmt = stmt.where(AuditLog.action == action)
    if start_date is not None:
        stmt = stmt.where(func.date(AuditLog.created_at) >= start_date)
    if end_date is not None:
        stmt = stmt.where(func.date(AuditLog.created_at) <= end_date)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    logs = (await db.execute(stmt)).scalars().all()
    return list(logs), total
