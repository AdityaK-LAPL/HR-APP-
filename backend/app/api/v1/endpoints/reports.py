"""Reporting/dashboard endpoints - see docs/api-contract.md section 18."""

import re
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_manager_or_owner
from app.core.company_time import company_today
from app.core.http import content_disposition
from app.db.session import get_db
from app.schemas.attendance_report import AttendanceAnalyticsResponse, LeaveAnalyticsResponse
from app.schemas.principal import CurrentUser
from app.schemas.report import (
    AttendanceReportRow,
    LeaveReportResponse,
    ServiceActivityReportResponse,
    TaskReportResponse,
    WorkloadRow,
)
from app.services import attendance_report_service, report_service, xlsx_reports
from app.services.audit_service import record_audit_log

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


# -------------------------------------------------------------------------------------------------
# Company attendance reports: analytics and .xlsx downloads (Owner, or a manager holding the
# `download_company_reports` permission). See docs/api-contract.md section 18a.
# -------------------------------------------------------------------------------------------------
async def company_reports_user(
    db: AsyncSession = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)
) -> CurrentUser:
    await attendance_report_service.open_company_reports(db, current_user)
    return current_user


MonthQuery = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM")


def _safe(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_") or "report"


async def _xlsx(
    db: AsyncSession, actor: CurrentUser, content: bytes, filename: str, what: str, **detail
) -> Response:
    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="report.downloaded",
        entity_type="report",
        entity_id=None,
        new_value={"report": what, **{k: str(v) for k, v in detail.items()}},
    )
    return Response(
        content=content,
        media_type=xlsx_reports.XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": content_disposition(filename)},
    )


@router.get("/attendance-analytics", response_model=AttendanceAnalyticsResponse)
async def attendance_analytics(
    month: str = MonthQuery,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(company_reports_user),
) -> dict:
    return await attendance_report_service.attendance_analytics(db, month)


@router.get("/leave-analytics", response_model=LeaveAnalyticsResponse)
async def leave_analytics(
    financial_year: int | None = Query(
        None, ge=2000, le=2100, description="The year the financial year (April-March) starts in"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(company_reports_user),
) -> dict:
    year = financial_year or attendance_report_service.current_financial_year_start()
    return await attendance_report_service.leave_analytics(db, year)


@router.get("/exports/attendance-monthly", response_class=Response)
async def export_attendance_monthly(
    employee_id: uuid.UUID,
    month: str = MonthQuery,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(company_reports_user),
) -> Response:
    report = await attendance_report_service.employee_month(db, employee_id, month)
    content = xlsx_reports.individual_month(report)
    name = f"Attendance_{_safe(report.user.name)}_{report.first.strftime('%B_%Y')}.xlsx"
    return await _xlsx(
        db, current_user, content, name, "attendance_monthly", employee_id=employee_id, month=month
    )


@router.get("/exports/attendance-daily", response_class=Response)
async def export_attendance_daily(
    day: date = Query(..., alias="date"),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(company_reports_user),
) -> Response:
    report = await attendance_report_service.day_report(db, day)
    content = xlsx_reports.day_report(report)
    return await _xlsx(
        db, current_user, content, f"DayReport_{day.isoformat()}.xlsx", "attendance_daily", date=day
    )


@router.get("/exports/leave-card", response_class=Response)
async def export_leave_card(
    employee_id: uuid.UUID,
    start_date: date | None = None,
    end_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(company_reports_user),
) -> Response:
    if start_date is None or end_date is None:
        first, last = attendance_report_service.financial_year(
            attendance_report_service.current_financial_year_start(company_today())
        )
        start_date, end_date = start_date or first, end_date or last
    card = await attendance_report_service.leave_card(db, employee_id, start_date, end_date)
    content = xlsx_reports.leave_card(card)
    return await _xlsx(
        db,
        current_user,
        content,
        f"LeaveCard_{_safe(card.user.name)}.xlsx",
        "leave_card",
        employee_id=employee_id,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/exports/attendance-summary", response_class=Response)
async def export_attendance_summary(
    month: str = MonthQuery,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(company_reports_user),
) -> Response:
    report = await attendance_report_service.month_summary(db, month)
    content = xlsx_reports.month_summary(report)
    name = f"AttendanceSummary_{report.first.strftime('%B_%Y')}.xlsx"
    return await _xlsx(db, current_user, content, name, "attendance_summary", month=month)
