"""The single company timezone (default Asia/Kolkata) and the day boundaries derived from it.

All timestamps are stored and transmitted as UTC instants. A *calendar date* that means "the
company's day" - an attendance `work_date`, "today" on a dashboard - is the date in the company
timezone, not in UTC and not in the viewer's browser timezone. The one clock used for that is
`utc_now()`, so tests can freeze it.
"""

from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.core.config import get_settings


def utc_now() -> datetime:
    return datetime.now(UTC)


@lru_cache
def company_tz() -> ZoneInfo:
    return ZoneInfo(get_settings().company_timezone)


def company_date_of(instant: datetime) -> date:
    """The company-local calendar date of an instant."""
    return instant.astimezone(company_tz()).date()


def company_today() -> date:
    return company_date_of(utc_now())


def company_day_bounds(day: date) -> tuple[datetime, datetime]:
    """[start, end) of a company-local calendar day, as UTC instants."""
    tz = company_tz()
    start = datetime.combine(day, time.min, tzinfo=tz)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz)
    return start.astimezone(UTC), end.astimezone(UTC)


def utc_offset_minutes(instant: datetime | None = None) -> int:
    offset = (instant or utc_now()).astimezone(company_tz()).utcoffset()
    return int(offset.total_seconds() // 60) if offset else 0
