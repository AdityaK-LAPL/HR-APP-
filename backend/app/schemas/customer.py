import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CustomerCreateRequest(BaseModel):
    customer_code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    address: str | None = None
    notes: str | None = None


class CustomerUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    address: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_code: str
    name: str
    address: str | None
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CustomerListResponse(BaseModel):
    items: list[CustomerResponse]
    total: int
    page: int
    page_size: int


class CustomerContactCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    designation: str | None = None
    phone: str | None = None
    email: str | None = None
    is_primary: bool = False


class CustomerContactUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    designation: str | None = None
    phone: str | None = None
    email: str | None = None
    is_primary: bool | None = None


class CustomerContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    name: str
    designation: str | None
    phone: str | None
    email: str | None
    is_primary: bool
