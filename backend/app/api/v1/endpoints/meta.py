"""Public application configuration the frontend needs before anyone logs in."""

from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.company_time import company_today, utc_offset_minutes
from app.core.config import get_settings

router = APIRouter(tags=["meta"])


class AppConfigResponse(BaseModel):
    company_timezone: str = Field(description="IANA name, e.g. Asia/Kolkata")
    utc_offset_minutes: int = Field(description="Current offset from UTC, e.g. 330 for IST")
    today: date = Field(description="Today's date in the company timezone (server clock)")


@router.get("/config", response_model=AppConfigResponse)
async def app_config() -> AppConfigResponse:
    """Company timezone and the server's idea of "today". Not sensitive; no login required."""
    return AppConfigResponse(
        company_timezone=get_settings().company_timezone,
        utc_offset_minutes=utc_offset_minutes(),
        today=company_today(),
    )
