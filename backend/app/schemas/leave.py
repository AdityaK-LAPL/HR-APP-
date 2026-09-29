import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LeaveCreateRequest(BaseModel):
    start_date: date
    end_date: date
    reason: str | None = None

    @model_validator(mode="after")
    def validate_date_range(self) -> "LeaveCreateRequest":
        if self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


class LeaveDecisionRequest(BaseModel):
    comments: str | None = None


class LeaveRejectRequest(BaseModel):
    comments: str = Field(..., min_length=1)


class LeaveApprovalEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    approver_id: uuid.UUID
    sequence: int
    decision: str
    comments: str | None
    decided_at: datetime


class LeaveResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    start_date: date
    end_date: date
    reason: str | None
    status: str
    current_approver_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class LeaveListResponse(BaseModel):
    items: list[LeaveResponse]
    total: int
    page: int
    page_size: int
