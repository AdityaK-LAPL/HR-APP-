"""Application exception hierarchy and FastAPI error handlers.

Every error the API returns uses the shape:

    {"error": {"code": "string", "message": "string"}}

Request-validation failures (HTTP 422, code "validation_failed") additionally carry
`"details": [{"field", "message", "type"}, ...]` so forms can show per-field errors;
input values are never echoed back.

Handlers never leak internal details (stack traces, SQL text, file paths) to
the client. Unexpected exceptions are logged server-side with the request id
for correlation and returned to the client as a generic 500 with that same
request id, so a report of "error X at time Y" can be traced back to the
full server-side log without ever exposing internals over the wire.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import request_id_var

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base class for all deliberately-raised application errors."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "bad_request"

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class ValidationFailedError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "validation_failed"


class AuthenticationError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "authentication_failed"


class AuthorizationError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "forbidden"


class PasswordChangeRequiredError(AppError):
    """Account carries a temporary/admin-set password: only change-password is allowed."""

    status_code = status.HTTP_403_FORBIDDEN
    code = "password_change_required"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


def _error_response(
    status_code: int, code: str, message: str, details: list[dict[str, str]] | None = None
) -> JSONResponse:
    error: dict[str, object] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return JSONResponse(status_code=status_code, content={"error": error})


def _field_errors(exc: RequestValidationError) -> list[dict[str, str]]:
    # Only location, message and type - never `input`, which can hold passwords.
    return [
        {
            "field": ".".join(
                str(part) for part in error["loc"] if part not in ("body", "query", "path")
            ),
            "message": str(error["msg"]),
            "type": str(error["type"]),
        }
        for error in exc.errors()
    ]


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return _error_response(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return _error_response(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "validation_failed",
            "The request contained invalid data.",
            details=_field_errors(exc),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == 404 else "http_error"
        message = exc.detail if isinstance(exc.detail, str) else "Request could not be processed."
        return _error_response(exc.status_code, code, message)

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        request_id = request_id_var.get() or "-"
        logger.exception("Unhandled exception during request (request_id=%s)", request_id)
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "internal_error",
            f"An unexpected error occurred. Reference: {request_id}",
        )
