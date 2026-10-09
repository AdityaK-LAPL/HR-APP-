import uuid

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    employee_code: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=200)
    new_password: str = Field(..., min_length=8, max_length=200)


class ResetPasswordRequest(BaseModel):
    temporary_password: str = Field(..., min_length=8, max_length=200)


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_code: str
    name: str
    designation: str | None
    role: str
    manager_id: uuid.UUID | None
    is_active: bool
    must_reset: bool = Field(
        default=False,
        description="True while the account has a temporary/admin-set password. The server "
        "rejects every endpoint except /auth/me, /auth/change-password and /auth/logout with "
        "403 `password_change_required` until the password is changed.",
    )
