"""Reporting/dashboard aggregate queries. See docs/api-contract.md section 18.

Every report is scoped by hierarchy exactly like the underlying list
endpoints (Owner: company-wide, Manager: subtree) - these are aggregates
over data the caller could already see via the ordinary list endpoints,
not a new authorization surface. `average_resolution_minutes` is an
approximation (`updated_at - created_at` for resolved/closed calls) since
there is no dedicated `resolved_at` timestamp in the schema.
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceDay
from app.models.identity import ManagerHierarchyClosure
from app.models.leave import LeaveRequest
from app.models.service import ServiceAssignment, ServiceCall
from app.models.task import Task
from app.schemas.principal import CurrentUser
from app.schemas.report import (
    AttendanceReportRow,
    LeaveReportResponse,
    ServiceActivityReportResponse,
    StatusCount,
    TaskReportResponse,
    WorkloadRow,
)

RESOLVED_STATUSES = ("resolved", "closed")


def _scoped_user_ids(actor: CurrentUser):
    """None means "no filter" (Owner sees everyone)."""
    if actor.role == "owner":
        return None
    if actor.role == "manager":
        return select(ManagerHierarchyClosure.descendant_id).where(
            ManagerHierarchyClosure.ancestor_id == actor.id
        )
    return [actor.id]


async def attendance_report(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    start_date: date | None,
    end_date: date | None,
    manager_id: uuid.UUID | None,
) -> list[AttendanceReportRow]:
    stmt = select(
        AttendanceDay.user_id,
        func.count(AttendanceDay.id).filter(AttendanceDay.punch_in_time.is_not(None)).label("days_present"),
        func.coalesce(func.sum(AttendanceDay.total_duration_minutes), 0).label("total_minutes"),
    ).group_by(AttendanceDay.user_id)

    scoped_ids = _scoped_user_ids(actor)
    if scoped_ids is not None:
        stmt = stmt.where(AttendanceDay.user_id.in_(scoped_ids))
    if manager_id is not None:
        from app.models.identity import User

        direct_reports = select(User.id).where(User.manager_id == manager_id)
        stmt = stmt.where(AttendanceDay.user_id.in_(direct_reports))
    if start_date is not None:
        stmt = stmt.where(AttendanceDay.work_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(AttendanceDay.work_date <= end_date)

    rows = (await db.execute(stmt)).all()
    return [
        AttendanceReportRow(
            user_id=row.user_id, days_present=row.days_present, total_minutes=row.total_minutes
        )
        for row in rows
    ]


async def task_report(
    db: AsyncSession, *, actor: CurrentUser, project_id: uuid.UUID | None
) -> TaskReportResponse:
    stmt = select(Task.status, func.count(Task.id)).group_by(Task.status)

    scoped_ids = _scoped_user_ids(actor)
    if scoped_ids is not None:
        stmt = stmt.where(Task.assigned_to.in_(scoped_ids))
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)

    rows = (await db.execute(stmt)).all()
    by_status = [StatusCount(status=status, count=count) for status, count in rows]
    return TaskReportResponse(by_status=by_status, total=sum(c.count for c in by_status))


async def leave_report(db: AsyncSession, *, actor: CurrentUser) -> LeaveReportResponse:
    stmt = select(LeaveRequest.status, func.count(LeaveRequest.id)).group_by(LeaveRequest.status)

    scoped_ids = _scoped_user_ids(actor)
    if scoped_ids is not None:
        stmt = stmt.where(LeaveRequest.employee_id.in_(scoped_ids))

    rows = (await db.execute(stmt)).all()
    by_status = [StatusCount(status=status, count=count) for status, count in rows]
    return LeaveReportResponse(by_status=by_status, total=sum(c.count for c in by_status))


async def workload_report(db: AsyncSession, *, actor: CurrentUser) -> list[WorkloadRow]:
    scoped_ids = _scoped_user_ids(actor)

    task_stmt = (
        select(Task.assigned_to, func.count(Task.id))
        .where(Task.status.not_in(("completed", "cancelled")))
        .group_by(Task.assigned_to)
    )
    if scoped_ids is not None:
        task_stmt = task_stmt.where(Task.assigned_to.in_(scoped_ids))
    task_counts = dict((await db.execute(task_stmt)).all())

    assignment_stmt = (
        select(ServiceAssignment.employee_id, func.count(ServiceAssignment.id))
        .where(ServiceAssignment.is_active.is_(True))
        .group_by(ServiceAssignment.employee_id)
    )
    if scoped_ids is not None:
        assignment_stmt = assignment_stmt.where(ServiceAssignment.employee_id.in_(scoped_ids))
    assignment_counts = dict((await db.execute(assignment_stmt)).all())

    user_ids = set(task_counts) | set(assignment_counts)
    return [
        WorkloadRow(
            user_id=user_id,
            open_task_count=task_counts.get(user_id, 0),
            active_service_assignment_count=assignment_counts.get(user_id, 0),
        )
        for user_id in user_ids
    ]


async def service_activity_report(
    db: AsyncSession, *, actor: CurrentUser, manager_id: uuid.UUID | None
) -> ServiceActivityReportResponse:
    stmt = select(ServiceCall.status, func.count(ServiceCall.id)).group_by(ServiceCall.status)

    if actor.role == "manager":
        scoped_ids = select(ManagerHierarchyClosure.descendant_id).where(
            ManagerHierarchyClosure.ancestor_id == actor.id
        )
        stmt = stmt.where(ServiceCall.responsible_manager_id.in_(scoped_ids))
    elif actor.role != "owner":
        stmt = stmt.where(ServiceCall.responsible_manager_id == actor.id)

    if manager_id is not None:
        stmt = stmt.where(ServiceCall.responsible_manager_id == manager_id)

    rows = (await db.execute(stmt)).all()
    by_status = [StatusCount(status=status, count=count) for status, count in rows]
    total_calls = sum(c.count for c in by_status)

    resolution_stmt = select(
        func.avg(
            func.extract("epoch", ServiceCall.updated_at - ServiceCall.created_at) / 60
        )
    ).where(ServiceCall.status.in_(RESOLVED_STATUSES))
    if actor.role == "manager":
        scoped_ids = select(ManagerHierarchyClosure.descendant_id).where(
            ManagerHierarchyClosure.ancestor_id == actor.id
        )
        resolution_stmt = resolution_stmt.where(ServiceCall.responsible_manager_id.in_(scoped_ids))
    elif actor.role != "owner":
        resolution_stmt = resolution_stmt.where(ServiceCall.responsible_manager_id == actor.id)
    average_resolution_minutes = (await db.execute(resolution_stmt)).scalar_one_or_none()

    return ServiceActivityReportResponse(
        by_status=by_status,
        total_calls=total_calls,
        average_resolution_minutes=average_resolution_minutes,
    )
