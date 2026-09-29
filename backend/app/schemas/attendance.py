import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class PunchRequest(BaseModel):
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)


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


class AttendanceListResponse(BaseModel):
    items: list[AttendanceDayResponse]
    total: int
    page: int
    page_size: int
