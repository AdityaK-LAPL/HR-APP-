"""Company-timezone helpers and /config (database-free)."""

from datetime import UTC, date, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.core.company_time import (
    company_date_of,
    company_day_bounds,
    company_tz,
    utc_offset_minutes,
)
from app.core.config import Settings
from app.main import app


def test_default_company_timezone_is_india_standard_time():
    assert str(company_tz()) == "Asia/Kolkata"
    assert utc_offset_minutes(datetime(2026, 3, 1, tzinfo=UTC)) == 330


def test_a_date_rolls_over_at_ist_midnight_not_utc_midnight():
    assert company_date_of(datetime(2026, 3, 1, 18, 29, tzinfo=UTC)) == date(
        2026, 3, 1
    )  # 23:59 IST
    assert company_date_of(datetime(2026, 3, 1, 18, 30, tzinfo=UTC)) == date(
        2026, 3, 2
    )  # 00:00 IST
    assert company_date_of(datetime(2026, 3, 1, 23, 59, tzinfo=UTC)) == date(2026, 3, 2)


def test_day_bounds_are_ist_midnights_expressed_in_utc():
    start, end = company_day_bounds(date(2026, 3, 2))
    assert start == datetime(2026, 3, 1, 18, 30, tzinfo=UTC)
    assert end == datetime(2026, 3, 2, 18, 30, tzinfo=UTC)


def test_an_invalid_timezone_is_rejected_at_startup():
    with pytest.raises(ValidationError):
        Settings(database_url="postgresql+asyncpg://x", company_timezone="Mars/Olympus_Mons")


async def test_config_endpoint_is_public_and_reports_ist():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/config")
    assert response.status_code == 200
    body = response.json()
    assert body["company_timezone"] == "Asia/Kolkata"
    assert body["utc_offset_minutes"] == 330
    assert date.fromisoformat(body["today"])
