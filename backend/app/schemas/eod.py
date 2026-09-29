import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class EodCreateRequest(BaseModel):
    report_date: date
    project_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    work_completed: str | None = None
    work_remaining: str | None = None
    issues: str | None = None
    notes: str | None = None


class EodResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    report_date: date
    project_id: uuid.UUID | None
    task_id: uuid.UUID | None
    work_completed: str | None
    work_remaining: str | None
    issues: str | None
    notes: str | None
    submitted_at: datetime


class EodListResponse(BaseModel):
    items: list[EodResponse]
    total: int
    page: int
    page_size: int
