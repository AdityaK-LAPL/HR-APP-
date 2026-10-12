"""Service report business logic. See docs/api-contract.md section 14.

Resolved default for Open Question 3: an Employee sees only their own
submitted report(s) on a call, never a teammate's, even if jointly
assigned - Manager/Owner can see all reports for calls in their scope.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, NotFoundError
from app.models.service import ServiceReport
from app.schemas.principal import CurrentUser
from app.schemas.service import ServiceReportCreateRequest
from app.services.audit_service import record_audit_log
from app.services.service_call_service import can_manage_call, fetch_call, is_assigned_to_call


async def submit_report(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    service_call_id: uuid.UUID,
    payload: ServiceReportCreateRequest,
) -> ServiceReport:
    call = await fetch_call(db, service_call_id)

    if not await is_assigned_to_call(db, actor, service_call_id):
        raise AuthorizationError("You must be assigned to this service call to submit a report.")

    report = ServiceReport(
        service_call_id=service_call_id,
        service_visit_id=payload.service_visit_id,
        employee_id=actor.id,
        report_datetime=payload.report_datetime or datetime.now(UTC),
        service_type=call.service_type,
        work_performed=payload.work_performed,
        problem_found=payload.problem_found,
        root_cause=payload.root_cause,
        action_taken=payload.action_taken,
        parts_used=payload.parts_used,
        result=payload.result,
        pending_work=payload.pending_work,
        recommendations=payload.recommendations,
        employee_comments=payload.employee_comments,
    )
    db.add(report)
    await db.flush()

    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="service_report.submitted",
        entity_type="service_report",
        entity_id=report.id,
        new_value={"service_call_id": str(service_call_id)},
    )
    await db.flush()
    return report


async def _can_view_report(db: AsyncSession, actor: CurrentUser, report: ServiceReport) -> bool:
    if report.employee_id == actor.id:
        return True
    call = await fetch_call(db, report.service_call_id)
    return await can_manage_call(db, actor, call)


async def get_report(
    db: AsyncSession, *, actor: CurrentUser, report_id: uuid.UUID
) -> ServiceReport:
    report = (
        await db.execute(select(ServiceReport).where(ServiceReport.id == report_id))
    ).scalar_one_or_none()
    if report is None:
        raise NotFoundError("Service report not found.")
    if not await _can_view_report(db, actor, report):
        raise AuthorizationError("You do not have permission to view this service report.")
    return report


async def list_reports(
    db: AsyncSession, *, actor: CurrentUser, service_call_id: uuid.UUID
) -> list[ServiceReport]:
    call = await fetch_call(db, service_call_id)

    stmt = select(ServiceReport).where(ServiceReport.service_call_id == service_call_id)
    if not await can_manage_call(db, actor, call):
        stmt = stmt.where(ServiceReport.employee_id == actor.id)
    stmt = stmt.order_by(ServiceReport.submitted_at)

    return list((await db.execute(stmt)).scalars().all())


async def review_report(
    db: AsyncSession, *, actor: CurrentUser, report_id: uuid.UUID, comments: str | None
) -> ServiceReport:
    report = (
        await db.execute(select(ServiceReport).where(ServiceReport.id == report_id))
    ).scalar_one_or_none()
    if report is None:
        raise NotFoundError("Service report not found.")

    call = await fetch_call(db, report.service_call_id)
    if not await can_manage_call(db, actor, call):
        raise AuthorizationError("You do not have permission to review this service report.")

    report.reviewed_by = actor.id
    report.reviewed_at = datetime.now(UTC)
    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="service_report.reviewed",
        entity_type="service_report",
        entity_id=report.id,
        new_value={"service_call_id": str(report.service_call_id)},
    )
    await db.flush()
    return report
