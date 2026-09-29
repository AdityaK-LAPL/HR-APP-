"""Audit log read endpoint - see docs/api-contract.md section 16."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_owner
from app.db.session import get_db
from app.schemas.audit import AuditLogListResponse, AuditLogResponse
from app.schemas.principal import CurrentUser
from app.services import audit_service

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    actor_user_id: uuid.UUID | None = None,
    action: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_owner),
) -> AuditLogListResponse:
    logs, total = await audit_service.list_audit_logs(
        db,
        actor=current_user,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_user_id,
        action=action,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )
    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
    )
