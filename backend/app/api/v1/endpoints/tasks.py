"""Task endpoints - see docs/api-contract.md section 4."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas.principal import CurrentUser
from app.schemas.task import (
    TaskCreateRequest,
    TaskHistoryEntry,
    TaskListResponse,
    TaskResponse,
    TaskUpdateRequest,
)
from app.services import task_service

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    assigned_to: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    status_: str | None = Query(None, alias="status"),
    task_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> TaskListResponse:
    tasks, total = await task_service.list_tasks(
        db,
        actor=current_user,
        assigned_to=assigned_to,
        project_id=project_id,
        status=status_,
        task_date=task_date,
        page=page,
        page_size=page_size,
    )
    return TaskListResponse(
        items=[TaskResponse.model_validate(t) for t in tasks],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> TaskResponse:
    task = await task_service.create_task(db, actor=current_user, payload=payload)
    return TaskResponse.model_validate(task)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> TaskResponse:
    task = await task_service.get_task(db, actor=current_user, task_id=task_id)
    return TaskResponse.model_validate(task)


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> TaskResponse:
    task = await task_service.update_task(db, actor=current_user, task_id=task_id, payload=payload)
    return TaskResponse.model_validate(task)


@router.get("/{task_id}/history", response_model=list[TaskHistoryEntry])
async def get_task_history(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[TaskHistoryEntry]:
    entries = await task_service.get_task_history(db, actor=current_user, task_id=task_id)
    return [TaskHistoryEntry.model_validate(e) for e in entries]
