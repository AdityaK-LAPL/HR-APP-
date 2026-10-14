import uuid
from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CompanySettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    company_name: str
    # 0 = Monday ... 6 = Sunday (Python's weekday numbering); the default is Saturday + Sunday.
    weekly_off_days: list[int]
    # A punch-in after this time (company time) counts as late in the attendance analytics.
    late_after: time


class CompanySettingsUpdateRequest(BaseModel):
    company_name: str | None = Field(None, min_length=1, max_length=120)
    weekly_off_days: list[int] | None = None
    late_after: time | None = None

    @field_validator("weekly_off_days")
    @classmethod
    def _weekdays(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("weekly_off_days are weekday numbers 0 (Monday) to 6 (Sunday)")
        return sorted(set(value))

    @field_validator("company_name")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        return value.strip() if value else value


class HolidayResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    holiday_date: date
    name: str
    is_active: bool


class HolidayCreateRequest(BaseModel):
    holiday_date: date
    name: str = Field(..., min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()
