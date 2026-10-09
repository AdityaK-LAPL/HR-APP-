"""Error response schemas.

These describe the shape app/core/errors.py actually returns, so the generated
OpenAPI document (and any client generated from it) matches the wire format
instead of FastAPI's default `{"detail": [...]}` validation-error shape.
"""

from pydantic import BaseModel, Field


class FieldError(BaseModel):
    field: str = Field(description="Dotted path of the invalid field, e.g. 'priority'.")
    message: str
    type: str = Field(description="Validation error type, e.g. 'missing', 'literal_error'.")


class ErrorBody(BaseModel):
    code: str = Field(
        description="authentication_failed | forbidden | not_found | conflict | validation_failed "
        "| rate_limit_exceeded | http_error | internal_error"
    )
    message: str
    details: list[FieldError] | None = Field(
        default=None,
        description="Present only on request-validation failures (HTTP 422 with code "
        "'validation_failed' from malformed input); one entry per invalid field. Input values "
        "are never echoed back.",
    )


class ErrorResponse(BaseModel):
    error: ErrorBody
