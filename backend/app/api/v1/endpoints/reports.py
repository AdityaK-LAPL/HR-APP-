"""Reporting/dashboard endpoints - see docs/api-contract.md section 18."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_manager_or_owner
from app.db.session import get_db
from app.schemas.principal import CurrentUser
from app.schemas.report import (
    AttendanceReportRow,
    LeaveReportResponse,
    ServiceActivityReportResponse,
    TaskReportResponse,
    WorkloadRow,
)
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/attendance", response_model=list[AttendanceReportRow])
async def attendance_report(
    start_date: date | None = None,
    end_date: date | None = None,
    manager_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_manager_or_owner),
) -> list[AttendanceReportRow]:
    return await report_service.attendance_report(
        db, actor=current_user, start_date=start_date, end_date=end_date, manager_id=manager_id
    )


@router.get("/tasks", response_model=TaskReportResponse)
async def task_report(
    project_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_manager_or_owner),
) -> TaskReportResponse:
    return await report_service.task_report(db, actor=current_user, project_id=project_id)


@router.get("/leave", response_model=LeaveReportResponse)
async def leave_report(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_manager_or_owner),
) -> LeaveReportResponse:
    return await report_service.leave_report(db, actor=current_user)


@router.get("/workload", response_model=list[WorkloadRow])
async def workload_report(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_manager_or_owner),
) -> list[WorkloadRow]:
    return await report_service.workload_report(db, actor=current_user)


@router.get("/service-activity", response_model=ServiceActivityReportResponse)
async def service_activity_report(
    manager_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_manager_or_owner),
) -> ServiceActivityReportResponse:
    return await report_service.service_activity_report(
        db, actor=current_user, manager_id=manager_id
    )
