import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.task import TASK_PRIORITIES, TASK_STATUSES


class TaskCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    project_id: uuid.UUID | None = None
    assigned_to: uuid.UUID
    priority: str = "medium"
    task_date: date | None = None
    due_date: date | None = None

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str) -> str:
        if value not in TASK_PRIORITIES:
            raise ValueError(f"priority must be one of {TASK_PRIORITIES}")
        return value


class TaskUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    project_id: uuid.UUID | None = None
    assigned_to: uuid.UUID | None = None
    priority: str | None = None
    status: str | None = None
    task_date: date | None = None
    due_date: date | None = None

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str | None) -> str | None:
        if value is not None and value not in TASK_PRIORITIES:
            raise ValueError(f"priority must be one of {TASK_PRIORITIES}")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None and value not in TASK_STATUSES:
            raise ValueError(f"status must be one of {TASK_STATUSES}")
        return value


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    project_id: uuid.UUID | None
    assigned_to: uuid.UUID
    assigned_by: uuid.UUID
    priority: str
    status: str
    task_date: date | None
    due_date: date | None
    created_at: datetime
    updated_at: datetime


class TaskListResponse(BaseModel):
    items: list[TaskResponse]
    total: int
    page: int
    page_size: int


class TaskHistoryEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    changed_by: uuid.UUID
    field_changed: str
    old_value: str | None
    new_value: str | None
    changed_at: datetime
