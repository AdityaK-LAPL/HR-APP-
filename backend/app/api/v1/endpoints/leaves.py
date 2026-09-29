"""Leave endpoints - see docs/api-contract.md section 6."""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas.leave import (
    LeaveCreateRequest,
    LeaveDecisionRequest,
    LeaveListResponse,
    LeaveRejectRequest,
    LeaveResponse,
)
from app.schemas.principal import CurrentUser
from app.services import leave_service

router = APIRouter(prefix="/leaves", tags=["leaves"])


@router.post("", response_model=LeaveResponse, status_code=status.HTTP_201_CREATED)
async def apply_leave(
    payload: LeaveCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> LeaveResponse:
    leave = await leave_service.apply_leave(db, actor=current_user, payload=payload)
    return LeaveResponse.model_validate(leave)


@router.get("", response_model=LeaveListResponse)
async def list_leaves(
    employee_id: uuid.UUID | None = None,
    status_: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> LeaveListResponse:
    leaves, total = await leave_service.list_leaves(
        db,
        actor=current_user,
        employee_id=employee_id,
        status=status_,
        page=page,
        page_size=page_size,
    )
    return LeaveListResponse(
        items=[LeaveResponse.model_validate(leave_row) for leave_row in leaves],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{leave_id}", response_model=LeaveResponse)
async def get_leave(
    leave_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> LeaveResponse:
    leave = await leave_service.get_leave(db, actor=current_user, leave_id=leave_id)
    return LeaveResponse.model_validate(leave)


@router.post("/{leave_id}/approve", response_model=LeaveResponse)
async def approve_leave(
    leave_id: uuid.UUID,
    payload: LeaveDecisionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> LeaveResponse:
    leave = await leave_service.approve_leave(
        db, actor=current_user, leave_id=leave_id, comments=payload.comments
    )
    return LeaveResponse.model_validate(leave)


@router.post("/{leave_id}/reject", response_model=LeaveResponse)
async def reject_leave(
    leave_id: uuid.UUID,
    payload: LeaveRejectRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> LeaveResponse:
    leave = await leave_service.reject_leave(
        db, actor=current_user, leave_id=leave_id, comments=payload.comments
    )
    return LeaveResponse.model_validate(leave)


@router.post("/{leave_id}/cancel", response_model=LeaveResponse)
async def cancel_leave(
    leave_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> LeaveResponse:
    leave = await leave_service.cancel_leave(db, actor=current_user, leave_id=leave_id)
    return LeaveResponse.model_validate(leave)
