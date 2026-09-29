"""Attendance endpoints - see docs/api-contract.md section 8."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas.attendance import (
    AttendanceDayResponse,
    AttendanceEventResponse,
    AttendanceListResponse,
    PunchRequest,
)
from app.schemas.principal import CurrentUser
from app.services import attendance_service

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.post("/punch-in", response_model=AttendanceDayResponse)
async def punch_in(
    payload: PunchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> AttendanceDayResponse:
    day = await attendance_service.punch_in(db, actor=current_user, payload=payload)
    return AttendanceDayResponse.model_validate(day)


@router.post("/punch-out", response_model=AttendanceDayResponse)
async def punch_out(
    payload: PunchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> AttendanceDayResponse:
    day = await attendance_service.punch_out(db, actor=current_user, payload=payload)
    return AttendanceDayResponse.model_validate(day)


@router.get("", response_model=AttendanceListResponse)
async def list_attendance(
    user_id: uuid.UUID | None = None,
    manager_id: uuid.UUID | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> AttendanceListResponse:
    days, total = await attendance_service.list_attendance(
        db,
        actor=current_user,
        user_id=user_id,
        manager_id=manager_id,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )
    return AttendanceListResponse(
        items=[AttendanceDayResponse.model_validate(d) for d in days],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{user_id}/{work_date}/events", response_model=list[AttendanceEventResponse])
async def get_events_for_day(
    user_id: uuid.UUID,
    work_date: date,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[AttendanceEventResponse]:
    events = await attendance_service.get_events_for_day(
        db, actor=current_user, user_id=user_id, work_date=work_date
    )
    return [AttendanceEventResponse.model_validate(e) for e in events]
