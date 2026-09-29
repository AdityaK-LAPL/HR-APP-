import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

VALID_ROLES = ("owner", "manager", "employee")


class UserCreateRequest(BaseModel):
    employee_code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    designation: str | None = Field(None, max_length=200)
    role: str
    manager_id: uuid.UUID | None = None
    initial_password: str = Field(..., min_length=8, max_length=200)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in VALID_ROLES:
            raise ValueError(f"role must be one of {VALID_ROLES}")
        return value


class UserUpdateRequest(BaseModel):
    """manager_id is deliberately not editable here - see
    POST /hierarchy/{user_id}/manager, which is the single code path for
    reassigning a user's manager (it also runs the cycle-prevention and
    closure-table-maintenance triggers and its own audit action)."""

    name: str | None = Field(None, min_length=1, max_length=200)
    designation: str | None = Field(None, max_length=200)
    role: str | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str | None) -> str | None:
        if value is not None and value not in VALID_ROLES:
            raise ValueError(f"role must be one of {VALID_ROLES}")
        return value


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_code: str
    name: str
    designation: str | None
    role: str
    manager_id: uuid.UUID | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int
    page: int
    page_size: int
