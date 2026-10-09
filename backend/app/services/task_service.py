"""Task business logic. See docs/api-contract.md section 4.

Field-level history (who changed what) is recorded in `task_history` for
every mutating update, on top of the coarser `audit_logs` entries for
creation/reassignment/status-change that context.md section 24 calls out
specifically.
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, NotFoundError, ValidationFailedError
from app.models.project import Project
from app.models.task import Task, TaskHistory
from app.schemas.principal import CurrentUser
from app.schemas.task import TaskCreateRequest, TaskUpdateRequest
from app.services.audit_service import record_audit_log
from app.services.permission_service import (
    can_view_user,
    has_permission,
    in_scope,
    visible_user_ids,
)
from app.services.user_lookup import UserStub, get_user_stub

TRACKED_FIELDS = (
    "title",
    "description",
    "project_id",
    "assigned_to",
    "priority",
    "status",
    "task_date",
    "due_date",
)


async def _get_active_user(db: AsyncSession, user_id: uuid.UUID) -> UserStub:
    user = await get_user_stub(db, user_id)
    if user is None or not user.is_active:
        raise ValidationFailedError("assigned_to does not reference an active user.")
    return user


async def _can_assign(db: AsyncSession, actor: CurrentUser, target_user: UserStub) -> bool:
    if actor.role == "owner":
        return True
    if target_user.id == actor.id:
        return True
    if await in_scope(db, actor, target_user.id):
        return True
    if actor.role == "manager" and target_user.role == "manager":
        return await has_permission(
            db, actor, "assign_tasks_to_manager", scope_type="user", scope_id=target_user.id
        )
    return False


async def _verify_project(db: AsyncSession, project_id: uuid.UUID) -> None:
    project = (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if project is None or not project.is_active:
        raise ValidationFailedError("project_id does not reference an active project.")


async def create_task(db: AsyncSession, *, actor: CurrentUser, payload: TaskCreateRequest) -> Task:
    if actor.role == "employee":
        raise AuthorizationError("Employees cannot create tasks.")

    assignee = await _get_active_user(db, payload.assigned_to)
    if not await _can_assign(db, actor, assignee):
        raise AuthorizationError("You do not have permission to assign a task to this user.")

    if payload.project_id is not None:
        await _verify_project(db, payload.project_id)

    task = Task(
        title=payload.title,
        description=payload.description,
        project_id=payload.project_id,
        assigned_to=payload.assigned_to,
        assigned_by=actor.id,
        priority=payload.priority,
        task_date=payload.task_date,
        due_date=payload.due_date,
    )
    db.add(task)
    await db.flush()

    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="task.created",
        entity_type="task",
        entity_id=task.id,
        new_value={
            "title": task.title,
            "assigned_to": str(task.assigned_to),
            "priority": task.priority,
        },
    )
    await db.flush()
    return task


def _task_visible(actor: CurrentUser, task: Task) -> bool:
    return (
        actor.role == "owner"
        or task.assigned_to == actor.id
        or task.assigned_by == actor.id
    )


async def get_task(db: AsyncSession, *, actor: CurrentUser, task_id: uuid.UUID) -> Task:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise NotFoundError("Task not found.")
    if not _task_visible(actor, task) and not await can_view_user(
        db, actor, task.assigned_to, "reports"
    ):
        raise AuthorizationError("You do not have permission to view this task.")
    return task


async def list_tasks(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    assigned_to: uuid.UUID | None,
    project_id: uuid.UUID | None,
    status: str | None,
    task_date: date | None,
    page: int,
    page_size: int,
) -> tuple[list[Task], int]:
    stmt = select(Task)

    if actor.role == "manager":
        stmt = stmt.where(
            Task.assigned_to.in_(visible_user_ids("reports")) | (Task.assigned_by == actor.id)
        )
    elif actor.role != "owner":
        stmt = stmt.where(Task.assigned_to == actor.id)

    if assigned_to is not None:
        stmt = stmt.where(Task.assigned_to == assigned_to)
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    if status is not None:
        stmt = stmt.where(Task.status == status)
    if task_date is not None:
        stmt = stmt.where(Task.task_date == task_date)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.order_by(Task.task_date.desc().nullslast(), Task.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    tasks = (await db.execute(stmt)).scalars().all()
    return list(tasks), total


async def update_task(
    db: AsyncSession, *, actor: CurrentUser, task_id: uuid.UUID, payload: TaskUpdateRequest
) -> Task:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise NotFoundError("Task not found.")

    manager_in_scope = actor.role == "manager" and (
        task.assigned_by == actor.id or await in_scope(db, actor, task.assigned_to)
    )
    can_manage = actor.role == "owner" or manager_in_scope
    is_assignee = task.assigned_to == actor.id

    if not can_manage and not is_assignee:
        raise AuthorizationError("You do not have permission to modify this task.")

    if not can_manage:
        other_fields_set = any(
            getattr(payload, field) is not None for field in TRACKED_FIELDS if field != "status"
        )
        if other_fields_set:
            raise AuthorizationError("You may only update the status of a task assigned to you.")

    changes: list[tuple[str, str | None, str | None]] = []

    if payload.assigned_to is not None and payload.assigned_to != task.assigned_to:
        new_assignee = await _get_active_user(db, payload.assigned_to)
        if not await _can_assign(db, actor, new_assignee):
            raise AuthorizationError("You do not have permission to assign a task to this user.")
        changes.append(("assigned_to", str(task.assigned_to), str(payload.assigned_to)))
        task.assigned_to = payload.assigned_to

    if payload.project_id is not None and payload.project_id != task.project_id:
        await _verify_project(db, payload.project_id)
        old_project_id = str(task.project_id) if task.project_id else None
        changes.append(("project_id", old_project_id, str(payload.project_id)))
        task.project_id = payload.project_id

    for field in ("title", "description", "priority", "status", "task_date", "due_date"):
        new_value = getattr(payload, field)
        if new_value is not None:
            old_value = getattr(task, field)
            if old_value != new_value:
                old_str = str(old_value) if old_value is not None else None
                changes.append((field, old_str, str(new_value)))
                setattr(task, field, new_value)

    await db.flush()

    for field_changed, old_value, new_value in changes:
        db.add(
            TaskHistory(
                task_id=task.id,
                changed_by=actor.id,
                field_changed=field_changed,
                old_value=old_value,
                new_value=new_value,
            )
        )

    reassigned = any(field == "assigned_to" for field, _, _ in changes)
    status_changed = any(field == "status" for field, _, _ in changes)
    if reassigned:
        await record_audit_log(
            db,
            actor_user_id=actor.id,
            action="task.reassigned",
            entity_type="task",
            entity_id=task.id,
            new_value={"assigned_to": str(task.assigned_to)},
        )
    if status_changed:
        await record_audit_log(
            db,
            actor_user_id=actor.id,
            action="task.status_changed",
            entity_type="task",
            entity_id=task.id,
            new_value={"status": task.status},
        )

    await db.flush()
    return task


async def get_task_history(
    db: AsyncSession, *, actor: CurrentUser, task_id: uuid.UUID
) -> list[TaskHistory]:
    await get_task(db, actor=actor, task_id=task_id)
    stmt = (
        select(TaskHistory).where(TaskHistory.task_id == task_id).order_by(TaskHistory.changed_at)
    )
    return list((await db.execute(stmt)).scalars().all())
