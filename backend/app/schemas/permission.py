import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

VALID_SCOPE_TYPES = ("user", "team", "project", "global")
VALID_EFFECTS = ("allow", "deny")


class PermissionGrantCreateRequest(BaseModel):
    grantee_user_id: uuid.UUID
    permission_key: str = Field(..., max_length=100)
    scope_type: str
    scope_id: uuid.UUID | None = None
    effect: str
    expires_at: datetime | None = None

    @field_validator("scope_type")
    @classmethod
    def validate_scope_type(cls, value: str) -> str:
        if value not in VALID_SCOPE_TYPES:
            raise ValueError(f"scope_type must be one of {VALID_SCOPE_TYPES}")
        return value

    @field_validator("effect")
    @classmethod
    def validate_effect(cls, value: str) -> str:
        if value not in VALID_EFFECTS:
            raise ValueError(f"effect must be one of {VALID_EFFECTS}")
        return value


class PermissionGrantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    grantee_user_id: uuid.UUID
    permission_key: str
    scope_type: str
    scope_id: uuid.UUID | None
    effect: str
    granted_by: uuid.UUID
    expires_at: datetime | None
    created_at: datetime
    revoked_at: datetime | None


class PermissionDefinitionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    description: str | None
    applies_to_role: str
