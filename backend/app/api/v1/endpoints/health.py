"""Liveness/readiness endpoints.

Unauthenticated by design - used by uptime monitors and local development,
not by the frontend application. Reveals no business data.
"""

from fastapi import APIRouter, status

from app.core.errors import AppError
from app.db.session import check_database_connection

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/health/db")
async def health_db() -> dict:
    try:
        await check_database_connection()
    except Exception as exc:
        raise AppError(
            "Database is not reachable.",
            code="database_unavailable",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        ) from exc
    return {"status": "ok", "database": "reachable"}
