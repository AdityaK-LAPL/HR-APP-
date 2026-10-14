"""Attendance business logic. See docs/api-contract.md section 8.

Location is captured only at the instant of a punch event, never polled
continuously, per context.md section 4. `work_date` is the calendar date of
the event in the company timezone (Asia/Kolkata by default - see
app/core/company_time.py); the timestamps themselves are UTC instants.

Each day is modeled as a single punch-in/punch-out pair (`attendance_days`
is a derived summary, unique per user per day) - a user who has already
completed a full cycle today cannot punch in again. The raw
`attendance_events` log has no such limit, so a future "breaks / multiple
sessions per day" feature can build on it without a schema change.
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.company_time import company_date_of, company_day_bounds, utc_now
from app.core.errors import AuthorizationError, ConflictError
from app.models.attendance import AttendanceDay, AttendanceEvent
from app.models.identity import User
from app.schemas.attendance import PunchRequest
from app.schemas.principal import CurrentUser
from app.services.permission_service import can_view_user, visible_user_ids


def _format_location(payload: PunchRequest) -> str | None:
    if payload.latitude is None or payload.longitude is None:
        return None
    return f"{payload.latitude},{payload.longitude}"


async def _get_today(
    db: AsyncSession, *, user_id: uuid.UUID, work_date: date
) -> AttendanceDay | None:
    stmt = select(AttendanceDay).where(
        AttendanceDay.user_id == user_id, AttendanceDay.work_date == work_date
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def punch_in(db: AsyncSession, *, actor: CurrentUser, payload: PunchRequest) -> AttendanceDay:
    now = utc_now()
    work_date = company_date_of(now)
    day = await _get_today(db, user_id=actor.id, work_date=work_date)

    if day is not None and day.punch_in_time is not None:
        if day.punch_out_time is None:
            raise ConflictError("You are already punched in for today.")
        raise ConflictError("You have already completed attendance for today.")

    location = _format_location(payload)
    db.add(
        AttendanceEvent(
            user_id=actor.id,
            event_type="punch_in",
            event_time=now,
            latitude=payload.latitude,
            longitude=payload.longitude,
            location_label=location,
        )
    )

    if day is None:
        day = AttendanceDay(user_id=actor.id, work_date=work_date)
        db.add(day)

    day.punch_in_time = now
    day.punch_in_location = location
    day.status = "present"
    day.work_mode = payload.work_mode or "at_office"
    day.remark = payload.remark
    await db.flush()
    return day


async def punch_out(
    db: AsyncSession, *, actor: CurrentUser, payload: PunchRequest
) -> AttendanceDay:
    now = utc_now()
    work_date = company_date_of(now)
    day = await _get_today(db, user_id=actor.id, work_date=work_date)

    if day is None or day.punch_in_time is None:
        raise ConflictError("You must punch in before punching out.")
    if day.punch_out_time is not None:
        raise ConflictError("You are already punched out for today.")

    location = _format_location(payload)
    db.add(
        AttendanceEvent(
            user_id=actor.id,
            event_type="punch_out",
            event_time=now,
            latitude=payload.latitude,
            longitude=payload.longitude,
            location_label=location,
        )
    )

    day.punch_out_time = now
    day.punch_out_location = location
    day.total_duration_minutes = int((now - day.punch_in_time).total_seconds() // 60)
    await db.flush()
    return day


async def list_attendance(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    user_id: uuid.UUID | None,
    manager_id: uuid.UUID | None,
    start_date: date | None,
    end_date: date | None,
    page: int,
    page_size: int,
) -> tuple[list[AttendanceDay], int]:
    stmt = select(AttendanceDay)

    if actor.role == "manager":
        stmt = stmt.where(AttendanceDay.user_id.in_(visible_user_ids("reports")))
    elif actor.role != "owner":
        stmt = stmt.where(AttendanceDay.user_id == actor.id)

    if user_id is not None:
        stmt = stmt.where(AttendanceDay.user_id == user_id)
    if manager_id is not None:
        direct_reports = select(User.id).where(User.manager_id == manager_id)
        stmt = stmt.where(AttendanceDay.user_id.in_(direct_reports))
    if start_date is not None:
        stmt = stmt.where(AttendanceDay.work_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(AttendanceDay.work_date <= end_date)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.order_by(AttendanceDay.work_date.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    days = (await db.execute(stmt)).scalars().all()
    return list(days), total


async def get_events_for_day(
    db: AsyncSession, *, actor: CurrentUser, user_id: uuid.UUID, work_date: date
) -> list[AttendanceEvent]:
    if not await can_view_user(db, actor, user_id, "reports"):
        raise AuthorizationError("You do not have permission to view this user's attendance.")

    day_start, day_end = company_day_bounds(work_date)
    stmt = (
        select(AttendanceEvent)
        .where(
            AttendanceEvent.user_id == user_id,
            AttendanceEvent.event_time >= day_start,
            AttendanceEvent.event_time < day_end,
        )
        .order_by(AttendanceEvent.event_time)
    )
    return list((await db.execute(stmt)).scalars().all())
