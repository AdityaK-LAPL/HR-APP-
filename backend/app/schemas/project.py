import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.project import PROJECT_STATUSES


class ProjectCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    status: str = "not_started"
    start_date: date | None = None
    expected_end_date: date | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in PROJECT_STATUSES:
            raise ValueError(f"status must be one of {PROJECT_STATUSES}")
        return value


class ProjectUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    status: str | None = None
    start_date: date | None = None
    expected_end_date: date | None = None
    actual_end_date: date | None = None
    is_active: bool | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None and value not in PROJECT_STATUSES:
            raise ValueError(f"status must be one of {PROJECT_STATUSES}")
        return value


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    owning_manager_id: uuid.UUID
    status: str
    start_date: date | None
    expected_end_date: date | None
    actual_end_date: date | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProjectListResponse(BaseModel):
    items: list[ProjectResponse]
    total: int
    page: int
    page_size: int


class ProjectMemberAddRequest(BaseModel):
    user_id: uuid.UUID
    role_in_project: str | None = Field(None, max_length=100)


class ProjectMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    role_in_project: str | None
    assigned_by: uuid.UUID
    assigned_at: datetime
    is_active: bool
