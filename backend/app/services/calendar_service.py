"""Team calendar - a read-only composite of tasks and leave, not a
separate table. See docs/api-contract.md section 9 and context.md
section 10.

Scoping matches every other list endpoint in this codebase (self +
manager subtree by default) rather than the finer-grained
per-subordinate-manager grant originally sketched - see the note in
api-contract.md section 9 for why that was simplified: introducing a
different scoping algorithm for just this one endpoint would be
inconsistent with, and harder to reason about than, the uniform pattern
used everywhere else.
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import User
from app.models.leave import LeaveRequest
from app.models.task import Task
from app.schemas.calendar import CalendarEntry
from app.schemas.principal import CurrentUser
from app.services.permission_service import visible_user_ids


def _scoped_user_ids(actor: CurrentUser):
    if actor.role == "owner":
        return None
    if actor.role == "manager":
        # Honours view_subordinate_manager_calendar allow/deny grants; row-level security
        # still decides which tasks/leave rows are readable at all.
        return visible_user_ids("calendar")
    # A plain list (not select(literal(...))): a bare literal is bound
    # untyped and asyncpg sends it as text, giving "uuid = text".
    return [actor.id]


async def get_calendar(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    user_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
    team: uuid.UUID | None,
    start_date: date,
    end_date: date,
) -> list[CalendarEntry]:
    scoped_ids = _scoped_user_ids(actor)
    entries: list[CalendarEntry] = []

    task_stmt = select(Task).where(Task.task_date >= start_date, Task.task_date <= end_date)
    if scoped_ids is not None:
        task_stmt = task_stmt.where(Task.assigned_to.in_(scoped_ids))
    if user_id is not None:
        task_stmt = task_stmt.where(Task.assigned_to == user_id)
    if project_id is not None:
        task_stmt = task_stmt.where(Task.project_id == project_id)
    if team is not None:
        direct_reports = select(User.id).where(User.manager_id == team)
        task_stmt = task_stmt.where(Task.assigned_to.in_(direct_reports))

    tasks = (await db.execute(task_stmt)).scalars().all()
    entries.extend(
        CalendarEntry(
            entry_date=task.task_date,
            entry_type="task",
            user_id=task.assigned_to,
            title=task.title,
            status=task.status,
            project_id=task.project_id,
        )
        for task in tasks
        if task.task_date is not None
    )

    leave_stmt = select(LeaveRequest).where(
        LeaveRequest.start_date <= end_date, LeaveRequest.end_date >= start_date
    )
    if scoped_ids is not None:
        leave_stmt = leave_stmt.where(LeaveRequest.employee_id.in_(scoped_ids))
    if user_id is not None:
        leave_stmt = leave_stmt.where(LeaveRequest.employee_id == user_id)
    if team is not None:
        direct_reports = select(User.id).where(User.manager_id == team)
        leave_stmt = leave_stmt.where(LeaveRequest.employee_id.in_(direct_reports))

    leaves = (await db.execute(leave_stmt)).scalars().all()
    entries.extend(
        CalendarEntry(
            entry_date=leave.start_date,
            entry_type="leave",
            user_id=leave.employee_id,
            title=f"Leave ({leave.status})",
            status=leave.status,
        )
        for leave in leaves
    )

    return sorted(entries, key=lambda entry: entry.entry_date)
