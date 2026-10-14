import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

LeaveKind = Literal["full_day", "half_day", "comp_off"]


def leave_days(kind: str, start: date, end: date) -> float:
    """What a request counts against the person's leave: every day of a full-day request, half a day
    for a half day, nothing for a compensatory off (a day taken in lieu of weekend/holiday work)."""
    if kind == "half_day":
        return 0.5
    if kind == "comp_off":
        return 0
    return (end - start).days + 1


class LeaveCreateRequest(BaseModel):
    start_date: date
    end_date: date
    reason: str | None = None
    leave_kind: LeaveKind = "full_day"

    @model_validator(mode="after")
    def validate_date_range(self) -> "LeaveCreateRequest":
        if self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        if self.leave_kind == "half_day" and self.start_date != self.end_date:
            raise ValueError("a half-day leave is for a single date")
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
    leave_kind: LeaveKind
    current_approver_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def days(self) -> float:
        return leave_days(self.leave_kind, self.start_date, self.end_date)


class LeaveListResponse(BaseModel):
    items: list[LeaveResponse]
    total: int
    page: int
    page_size: int
