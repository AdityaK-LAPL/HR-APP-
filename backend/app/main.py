"""FastAPI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.middleware import RequestContextMiddleware
from app.schemas.errors import ErrorResponse


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="Company Management & Service App API",
        version="0.1.0",
        # Auto docs are useful during development but should not be assumed
        # to be the source of truth for permission semantics - see
        # docs/api-contract.md. FastAPI still serves the raw schema at
        # openapi_url even with docs_url/redoc_url disabled unless that is
        # also turned off - all three need to go together in production.
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        # Every endpoint can fail with these; declaring them here (instead of
        # FastAPI's default {"detail": [...]} 422) makes the OpenAPI document match
        # the real wire format - see app/core/errors.py.
        responses={
            401: {"model": ErrorResponse, "description": "Not authenticated / session expired"},
            403: {"model": ErrorResponse, "description": "Visible but not permitted, or bad CSRF"},
            404: {
                "model": ErrorResponse,
                "description": "Not found, or outside the caller's visibility",
            },
            409: {"model": ErrorResponse, "description": "Conflict with current state"},
            422: {"model": ErrorResponse, "description": "Invalid request (see error.details)"},
        },
    )

    app.add_middleware(RequestContextMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
    )

    register_exception_handlers(app)

    app.include_router(api_router, prefix="/api/v1")

    return app


app = create_app()
