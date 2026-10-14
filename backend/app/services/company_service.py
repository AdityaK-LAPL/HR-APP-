"""Company settings and holiday list - the calendar behind attendance reports.

Anyone signed in may read it; only the Owner changes it (row-level security says the same). Changes
are audited. Holidays are never deleted: removing one switches `is_active` off, and adding the same
date again switches it back on.
"""

import uuid
from datetime import date, time

from sqlalchemy import extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, ConflictError, NotFoundError
from app.models.company import CompanyHoliday, CompanySettings
from app.schemas.company import CompanySettingsUpdateRequest, HolidayCreateRequest
from app.schemas.principal import CurrentUser
from app.services.audit_service import record_audit_log

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


async def get_settings_row(db: AsyncSession, *, create: bool = False) -> CompanySettings:
    """The single settings row. A fresh database always has it (migration 0020); if it is missing,
    readers get the defaults, and only the Owner's change (`create=True`) writes it back."""
    row = (
        await db.execute(select(CompanySettings).where(CompanySettings.id == 1))
    ).scalar_one_or_none()
    if row is not None:
        return row
    if not create:
        return CompanySettings(
            id=1, company_name="Laser Automation", weekly_off_days=[5, 6], late_after=time(9, 30)
        )
    row = CompanySettings(id=1)
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


def _snapshot(row: CompanySettings) -> dict:
    return {
        "company_name": row.company_name,
        "weekly_off_days": list(row.weekly_off_days),
        "late_after": row.late_after.strftime("%H:%M"),
    }


async def update_settings(
    db: AsyncSession, *, actor: CurrentUser, payload: CompanySettingsUpdateRequest
) -> CompanySettings:
    if actor.role != "owner":
        raise AuthorizationError("Only the Owner can change the company settings.")
    row = await get_settings_row(db, create=True)
    before = _snapshot(row)
    if payload.company_name is not None:
        row.company_name = payload.company_name
    if payload.weekly_off_days is not None:
        row.weekly_off_days = payload.weekly_off_days
    if payload.late_after is not None:
        row.late_after = payload.late_after.replace(second=0, microsecond=0)
    row.updated_by = actor.id
    await db.flush()
    await db.refresh(row)
    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="company.settings_changed",
        entity_type="company_settings",
        entity_id=None,
        old_value=before,
        new_value=_snapshot(row),
    )
    return row


async def list_holidays(
    db: AsyncSession, *, year: int | None, include_removed: bool = False
) -> list[CompanyHoliday]:
    stmt = select(CompanyHoliday)
    if year is not None:
        stmt = stmt.where(extract("year", CompanyHoliday.holiday_date) == year)
    if not include_removed:
        stmt = stmt.where(CompanyHoliday.is_active.is_(True))
    return list((await db.execute(stmt.order_by(CompanyHoliday.holiday_date))).scalars().all())


async def holiday_dates(db: AsyncSession, start: date, end: date) -> set[date]:
    stmt = select(CompanyHoliday.holiday_date).where(
        CompanyHoliday.is_active.is_(True),
        CompanyHoliday.holiday_date >= start,
        CompanyHoliday.holiday_date <= end,
    )
    return set((await db.execute(stmt)).scalars().all())


async def add_holiday(
    db: AsyncSession, *, actor: CurrentUser, payload: HolidayCreateRequest
) -> CompanyHoliday:
    if actor.role != "owner":
        raise AuthorizationError("Only the Owner can change the holiday list.")
    existing = (
        await db.execute(
            select(CompanyHoliday).where(CompanyHoliday.holiday_date == payload.holiday_date)
        )
    ).scalar_one_or_none()
    if existing is not None and existing.is_active:
        raise ConflictError("That date is already on the holiday list.")
    if existing is not None:
        existing.is_active = True
        existing.name = payload.name
        holiday = existing
    else:
        holiday = CompanyHoliday(
            holiday_date=payload.holiday_date, name=payload.name, created_by=actor.id
        )
        db.add(holiday)
    await db.flush()
    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="company.holiday_added",
        entity_type="company_holiday",
        entity_id=holiday.id,
        new_value={"date": payload.holiday_date.isoformat(), "name": payload.name},
    )
    return holiday


async def remove_holiday(db: AsyncSession, *, actor: CurrentUser, holiday_id: uuid.UUID) -> None:
    if actor.role != "owner":
        raise AuthorizationError("Only the Owner can change the holiday list.")
    holiday = (
        await db.execute(select(CompanyHoliday).where(CompanyHoliday.id == holiday_id))
    ).scalar_one_or_none()
    if holiday is None or not holiday.is_active:
        raise NotFoundError("Holiday not found.")
    holiday.is_active = False
    await db.flush()
    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="company.holiday_removed",
        entity_type="company_holiday",
        entity_id=holiday.id,
        old_value={"date": holiday.holiday_date.isoformat(), "name": holiday.name},
    )


def late_cutoff(settings: CompanySettings) -> time:
    return settings.late_after
