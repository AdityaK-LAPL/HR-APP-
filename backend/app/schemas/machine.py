import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.machine import MACHINE_STATUSES


class MachineCreateRequest(BaseModel):
    customer_id: uuid.UUID
    machine_code: str = Field(..., min_length=1, max_length=50)
    model_name: str | None = None
    serial_number: str | None = None
    installation_date: date | None = None
    purchase_info: str | None = None
    warranty_info: str | None = None
    location: str | None = None


class MachineUpdateRequest(BaseModel):
    model_name: str | None = None
    serial_number: str | None = None
    installation_date: date | None = None
    purchase_info: str | None = None
    warranty_info: str | None = None
    location: str | None = None
    status: str | None = None
    is_active: bool | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None and value not in MACHINE_STATUSES:
            raise ValueError(f"status must be one of {MACHINE_STATUSES}")
        return value


class MachineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    machine_code: str
    customer_id: uuid.UUID
    model_name: str | None
    serial_number: str | None
    installation_date: date | None
    purchase_info: str | None
    warranty_info: str | None
    location: str | None
    status: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class MachineListResponse(BaseModel):
    items: list[MachineResponse]
    total: int
    page: int
    page_size: int
