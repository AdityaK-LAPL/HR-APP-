import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

WorkMode = Literal["at_office", "work_from_home", "on_duty"]


class PunchRequest(BaseModel):
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    # Punch-in only: where the person is working today. Left out = "at_office" (older clients).
    work_mode: WorkMode | None = None
    # Punch-in only: a short remark that appears on the reports ("KSB Coimbatore").
    remark: str | None = Field(None, max_length=200)

    @field_validator("remark")
    @classmethod
    def _tidy_remark(cls, value: str | None) -> str | None:
        value = " ".join(value.split()) if value else None
        return value or None


class AttendanceEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    event_type: str
    event_time: datetime
    latitude: float | None
    longitude: float | None
    location_label: str | None


class AttendanceDayResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    work_date: date
    punch_in_time: datetime | None
    punch_in_location: str | None
    punch_out_time: datetime | None
    punch_out_location: str | None
    total_duration_minutes: int | None
    status: str
    work_mode: WorkMode | None
    remark: str | None


class AttendanceListResponse(BaseModel):
    items: list[AttendanceDayResponse]
    total: int
    page: int
    page_size: int
