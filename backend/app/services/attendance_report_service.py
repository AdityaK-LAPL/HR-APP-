"""The day-by-day attendance picture behind the xlsx reports and the attendance analytics.

One person-day is described by ONE code (the "Type" column of the company's own sheets), worked out
by `classify_day` from four facts only:

* an approved leave covering the date  -> FD Leave / HD Leave / C/Off
* the punch (and the work mode chosen at punch-in) -> At Office / WFH / OD, or WOW / HW when the
  person worked on a weekly off / a holiday
* the company calendar (weekly-off weekdays + holiday list) -> W/Off / Holiday when nobody came in
* otherwise a past working day with nothing recorded -> Absent (today and the future stay blank)

Reading is done under the Owner's row-level-security context after `open_company_reports` has
checked that the caller is the Owner or a manager the Owner gave `download_company_reports`: those
two see the whole company here (and only here) without a new role. Nothing in this module writes
except the audit entry for a download.
"""

import uuid
from calendar import monthrange
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.company_time import company_today, company_tz
from app.core.errors import AuthorizationError, NotFoundError, ValidationFailedError
from app.db.session import set_rls_context
from app.models.attendance import AttendanceDay
from app.models.company import CompanyHoliday, CompanySettings
from app.models.identity import User
from app.models.leave import LeaveRequest
from app.schemas.leave import leave_days
from app.schemas.principal import CurrentUser
from app.services.company_service import get_settings_row
from app.services.permission_service import has_permission

REPORT_PERMISSION = "download_company_reports"

# code -> (meaning shown in the legend, fill colour of the cell in the sheets, counts as worked)
TYPES: dict[str, tuple[str, str | None]] = {
    "At Office": ("At Office = Working From Office", None),
    "WFH": ("WFH = Work From Home", "70AD47"),
    "OD": ("OD = On Duty (at a customer / site)", "76E3FF"),
    "WOW": ("WOW = Weekly Off Working", "FFC000"),
    "HW": ("HW = Holiday Working", "BF9000"),
    "C/Off": ("C/Off = Compensatory Off", "C55A11"),
    "W/Off": ("W/Off = Weekly Off", "227ACB"),
    "Holiday": ("Holiday = Company holiday", "9DB7D5"),
    "FD Leave": ("FD Leave = Full Day Leave", "FFFF00"),
    "HD Leave": ("HD Leave = Half Day Leave", "FFFF00"),
    "Absent": ("Absent = No punch and no approved leave on a working day", "FF9999"),
}
WORKED_CODES = {"At Office", "WFH", "OD", "WOW", "HW"}
MODE_CODE = {"at_office": "At Office", "work_from_home": "WFH", "on_duty": "OD"}
LEAVE_CODE = {"full_day": "FD Leave", "half_day": "HD Leave", "comp_off": "C/Off"}
LEAVE_PRIORITY = {"full_day": 0, "half_day": 1, "comp_off": 2}


@dataclass(frozen=True)
class CompanyCalendar:
    company_name: str
    weekly_off: frozenset[int]
    holidays: dict[date, str]
    late_after: time
    today: date

    def is_weekly_off(self, day: date) -> bool:
        return day.weekday() in self.weekly_off


@dataclass(frozen=True)
class DayRow:
    day: date
    code: str  # "" = nothing to say (before joining, today before punching, the future)
    punch_in: datetime | None = None  # company-local wall clock
    punch_out: datetime | None = None
    location_in: str | None = None
    location_out: str | None = None
    remark: str = ""
    minutes: int | None = None
    worked: float = 0.0  # working-day credit: 1 per worked day, 0.5 for a half-day leave
    late: bool = False
    leave_days: float = 0.0


@dataclass
class Summary:
    days_worked: float = 0.0
    at_office: int = 0
    wfh: int = 0
    od: int = 0
    wow: int = 0
    hw: int = 0
    fd_leave: int = 0
    hd_leave: int = 0
    comp_off: int = 0
    weekly_off: int = 0
    holiday: int = 0
    absent: int = 0
    leave_days: float = 0.0
    total_minutes: int = 0
    days_with_hours: int = 0
    late_count: int = 0
    in_minutes_total: int = 0
    in_count: int = 0
    counts: dict[str, int] = field(default_factory=lambda: defaultdict(int))

    @property
    def average_minutes(self) -> int | None:
        return round(self.total_minutes / self.days_with_hours) if self.days_with_hours else None

    @property
    def average_in_minute(self) -> int | None:
        return round(self.in_minutes_total / self.in_count) if self.in_count else None


def add_to_summary(summary: Summary, row: DayRow) -> None:
    if not row.code:
        return
    summary.counts[row.code] += 1
    summary.days_worked += row.worked
    summary.leave_days += row.leave_days
    attr = {
        "At Office": "at_office", "WFH": "wfh", "OD": "od", "WOW": "wow", "HW": "hw",
        "FD Leave": "fd_leave", "HD Leave": "hd_leave", "C/Off": "comp_off",
        "W/Off": "weekly_off", "Holiday": "holiday", "Absent": "absent",
    }[row.code]  # fmt: skip
    setattr(summary, attr, getattr(summary, attr) + 1)
    if row.minutes is not None:
        summary.total_minutes += row.minutes
        summary.days_with_hours += 1
    if row.punch_in is not None:
        summary.in_minutes_total += row.punch_in.hour * 60 + row.punch_in.minute
        summary.in_count += 1
    if row.late:
        summary.late_count += 1


def _local(instant: datetime | None) -> datetime | None:
    return instant.astimezone(company_tz()).replace(tzinfo=None) if instant else None


def classify_day(
    day: date,
    *,
    joined: date | None,
    attendance: AttendanceDay | None,
    leave: LeaveRequest | None,
    calendar: CompanyCalendar,
) -> DayRow:
    """The single rule that turns the raw facts of one person-day into one report row."""
    if joined is not None and day < joined and attendance is None and leave is None:
        return DayRow(day=day, code="")

    punch_in = _local(attendance.punch_in_time) if attendance else None
    punch_out = _local(attendance.punch_out_time) if attendance else None
    minutes = None
    if attendance and attendance.punch_in_time and attendance.punch_out_time:
        minutes = attendance.total_duration_minutes
        if minutes is None:
            minutes = int(
                (attendance.punch_out_time - attendance.punch_in_time).total_seconds() // 60
            )
    base = {
        "day": day,
        "punch_in": punch_in,
        "punch_out": punch_out,
        "location_in": attendance.punch_in_location if attendance else None,
        "location_out": attendance.punch_out_location if attendance else None,
        "minutes": minutes,
    }
    holiday_name = calendar.holidays.get(day)
    punched = punch_in is not None

    if leave is not None:
        code = LEAVE_CODE[leave.leave_kind]
        return DayRow(
            code=code,
            remark=(leave.reason or "").strip(),
            worked=0.5 if leave.leave_kind == "half_day" else 0.0,
            leave_days=leave_days(leave.leave_kind, day, day),
            **base,
        )
    if punched:
        if holiday_name is not None:
            code = "HW"
        elif calendar.is_weekly_off(day):
            code = "WOW"
        else:
            code = MODE_CODE.get(attendance.work_mode or "at_office", "At Office")
        remark = (attendance.remark or "").strip()
        if code == "HW" and not remark:
            remark = holiday_name or ""
        late = (
            code in {"At Office", "WFH", "OD"}
            and punch_in.time().replace(second=0) > calendar.late_after
        )
        return DayRow(code=code, remark=remark, worked=1.0, late=late, **base)
    if holiday_name is not None:
        return DayRow(code="Holiday", remark=holiday_name, **base)
    if calendar.is_weekly_off(day):
        return DayRow(code="W/Off", **base)
    if day < calendar.today:
        return DayRow(code="Absent", **base)
    return DayRow(code="", **base)


# ---------------------------------------------------------------------------------------- access
async def open_company_reports(db: AsyncSession, actor: CurrentUser) -> None:
    """Allow the Owner, or a manager holding `download_company_reports`, to read company-wide
    attendance and leave for the rest of this request - and no one else."""
    if actor.role == "owner":
        return
    if actor.role != "manager" or not await has_permission(
        db, actor, REPORT_PERMISSION, scope_type="global", scope_id=None
    ):
        raise AuthorizationError("You do not have permission to use the company reports.")
    await set_rls_context(db, user_id=str(actor.id), role="owner")


# ------------------------------------------------------------------------------------------ loading
def parse_month(text: str) -> tuple[date, date]:
    try:
        year, month = (int(part) for part in text.split("-"))
        first = date(year, month, 1)
    except (ValueError, TypeError) as exc:
        raise ValidationFailedError("month must look like 2026-09") from exc
    return first, date(year, month, monthrange(year, month)[1])


def month_title(first: date) -> str:
    return first.strftime("%B %Y")


async def load_calendar(db: AsyncSession, start: date, end: date) -> CompanyCalendar:
    settings: CompanySettings = await get_settings_row(db)
    holidays = {
        h.holiday_date: h.name
        for h in (
            await db.execute(
                select(CompanyHoliday).where(
                    CompanyHoliday.is_active.is_(True),
                    CompanyHoliday.holiday_date >= start,
                    CompanyHoliday.holiday_date <= end,
                )
            )
        )
        .scalars()
        .all()
    }
    return CompanyCalendar(
        company_name=settings.company_name,
        weekly_off=frozenset(settings.weekly_off_days),
        holidays=holidays,
        late_after=settings.late_after,
        today=company_today(),
    )


def _joined_on(user: User) -> date:
    return user.created_at.astimezone(company_tz()).date()


async def _attendance(db, start, end, user_ids=None):
    stmt = select(AttendanceDay).where(
        AttendanceDay.work_date >= start, AttendanceDay.work_date <= end
    )
    if user_ids is not None:
        stmt = stmt.where(AttendanceDay.user_id.in_(user_ids))
    out: dict[tuple[uuid.UUID, date], AttendanceDay] = {}
    for row in (await db.execute(stmt)).scalars().all():
        out[(row.user_id, row.work_date)] = row
    return out


async def _leaves(db, start, end, user_ids=None):
    """(user, date) -> the approved leave covering that date (full day > half day > comp-off)."""
    stmt = select(LeaveRequest).where(
        LeaveRequest.status == "approved",
        LeaveRequest.start_date <= end,
        LeaveRequest.end_date >= start,
    )
    if user_ids is not None:
        stmt = stmt.where(LeaveRequest.employee_id.in_(user_ids))
    out: dict[tuple[uuid.UUID, date], LeaveRequest] = {}
    for leave in (await db.execute(stmt)).scalars().all():
        day = max(leave.start_date, start)
        while day <= min(leave.end_date, end):
            current = out.get((leave.employee_id, day))
            if (
                current is None
                or LEAVE_PRIORITY[leave.leave_kind] < LEAVE_PRIORITY[current.leave_kind]
            ):
                out[(leave.employee_id, day)] = leave
            day += timedelta(days=1)
    return out


async def reportable_users(db: AsyncSession, start: date, end: date) -> list[User]:
    """Everyone the reports are about: active employees and managers who had joined by the end of
    the period, plus anybody (the Owner, a person since deactivated) who has attendance or approved
    leave in the period."""
    with_attendance = select(AttendanceDay.user_id).where(
        AttendanceDay.work_date >= start, AttendanceDay.work_date <= end
    )
    with_leave = select(LeaveRequest.employee_id).where(
        LeaveRequest.status == "approved",
        LeaveRequest.start_date <= end,
        LeaveRequest.end_date >= start,
    )
    has_data = set((await db.execute(with_attendance)).scalars().all())
    has_data |= set((await db.execute(with_leave)).scalars().all())
    stmt = select(User).where(
        or_((User.is_active.is_(True)) & (User.role != "owner"), User.id.in_(has_data))
    )
    users = (await db.execute(stmt.order_by(User.name))).scalars().all()
    return [u for u in users if u.id in has_data or _joined_on(u) <= end]


async def get_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise NotFoundError("Person not found.")
    return user


def each_day(start: date, end: date):
    day = start
    while day <= end:
        yield day
        day += timedelta(days=1)


# ------------------------------------------------------------------------------------ the reports
@dataclass
class EmployeeMonth:
    user: User
    first: date
    last: date
    rows: list[DayRow]
    summary: Summary
    calendar: CompanyCalendar


async def employee_month(db: AsyncSession, user_id: uuid.UUID, month: str) -> EmployeeMonth:
    first, last = parse_month(month)
    user = await get_user(db, user_id)
    calendar = await load_calendar(db, first, last)
    attendance = await _attendance(db, first, last, [user_id])
    leaves = await _leaves(db, first, last, [user_id])
    joined = _joined_on(user)
    rows, summary = [], Summary()
    for day in each_day(first, last):
        row = classify_day(
            day, joined=joined, attendance=attendance.get((user_id, day)),
            leave=leaves.get((user_id, day)), calendar=calendar,
        )  # fmt: skip
        rows.append(row)
        add_to_summary(summary, row)
    return EmployeeMonth(user, first, last, rows, summary, calendar)


@dataclass
class DayReport:
    day: date
    calendar: CompanyCalendar
    people: list[tuple[User, DayRow]]
    summary: Summary


async def day_report(db: AsyncSession, day: date) -> DayReport:
    calendar = await load_calendar(db, day, day)
    users = await reportable_users(db, day, day)
    ids = [u.id for u in users]
    attendance = await _attendance(db, day, day, ids)
    leaves = await _leaves(db, day, day, ids)
    people, summary = [], Summary()
    for user in users:
        row = classify_day(
            day, joined=_joined_on(user), attendance=attendance.get((user.id, day)),
            leave=leaves.get((user.id, day)), calendar=calendar,
        )  # fmt: skip
        people.append((user, row))
        add_to_summary(summary, row)
    return DayReport(day, calendar, people, summary)


@dataclass
class LeaveCardRow:
    day: date
    code: str
    days: float
    punch_in: datetime | None
    punch_out: datetime | None
    reason: str


@dataclass
class LeaveCard:
    user: User
    start: date
    end: date
    rows: list[LeaveCardRow]
    total_days: float
    company_name: str


def financial_year(start_year: int) -> tuple[date, date]:
    return date(start_year, 4, 1), date(start_year + 1, 3, 31)


def current_financial_year_start(today: date | None = None) -> int:
    today = today or company_today()
    return today.year if today.month >= 4 else today.year - 1


async def leave_card(db: AsyncSession, user_id: uuid.UUID, start: date, end: date) -> LeaveCard:
    if end < start:
        raise ValidationFailedError("The end date cannot be before the start date.")
    user = await get_user(db, user_id)
    settings = await get_settings_row(db)
    leaves = await _leaves(db, start, end, [user_id])
    attendance = await _attendance(db, start, end, [user_id])
    rows: list[LeaveCardRow] = []
    for day in each_day(start, end):
        leave = leaves.get((user_id, day))
        if leave is None:
            continue
        att = attendance.get((user_id, day))
        rows.append(
            LeaveCardRow(
                day=day,
                code=LEAVE_CODE[leave.leave_kind],
                days=leave_days(leave.leave_kind, day, day),
                punch_in=_local(att.punch_in_time) if att else None,
                punch_out=_local(att.punch_out_time) if att else None,
                reason=(leave.reason or "").strip(),
            )
        )
    return LeaveCard(user, start, end, rows, sum(r.days for r in rows), settings.company_name)


@dataclass
class MonthSummary:
    first: date
    last: date
    calendar: CompanyCalendar
    people: list[tuple[User, Summary, list[DayRow]]]
    daily: list[dict]


async def month_summary(db: AsyncSession, month: str) -> MonthSummary:
    first, last = parse_month(month)
    calendar = await load_calendar(db, first, last)
    users = await reportable_users(db, first, last)
    ids = [u.id for u in users]
    attendance = await _attendance(db, first, last, ids)
    leaves = await _leaves(db, first, last, ids)
    people = []
    daily: dict[date, dict] = {
        d: {
            "date": d,
            "weekly_off": calendar.is_weekly_off(d),
            "holiday": d in calendar.holidays,
            "counts": defaultdict(int),
        }
        for d in each_day(first, last)
    }  # fmt: skip
    for user in users:
        summary, joined, rows = Summary(), _joined_on(user), []
        for day in each_day(first, last):
            row = classify_day(
                day, joined=joined, attendance=attendance.get((user.id, day)),
                leave=leaves.get((user.id, day)), calendar=calendar,
            )  # fmt: skip
            add_to_summary(summary, row)
            rows.append(row)
            if row.code:
                daily[day]["counts"][row.code] += 1
        people.append((user, summary, rows))
    return MonthSummary(first, last, calendar, people, [daily[d] for d in sorted(daily)])


# ----------------------------------------------------------------------------------- analytics
async def attendance_analytics(db: AsyncSession, month: str) -> dict:
    report = await month_summary(db, month)
    today = report.calendar.today
    people = []
    totals = Summary()
    for user, s, _rows in report.people:
        people.append(
            {
                "user_id": user.id,
                "name": user.name,
                "employee_code": user.employee_code,
                "days_worked": s.days_worked,
                "at_office": s.at_office,
                "work_from_home": s.wfh,
                "on_duty": s.od,
                "weekend_or_holiday_working": s.wow + s.hw,
                "leave_days": s.leave_days,
                "comp_off": s.comp_off,
                "absent": s.absent,
                "total_minutes": s.total_minutes,
                "average_minutes": s.average_minutes,
                "late_count": s.late_count,
                "average_in_minute": s.average_in_minute,
            }
        )
        totals.days_worked += s.days_worked
        totals.total_minutes += s.total_minutes
        totals.days_with_hours += s.days_with_hours
        totals.late_count += s.late_count
        totals.leave_days += s.leave_days
    daily = []
    working_days = 0
    for point in report.daily:
        c = point["counts"]
        if not point["weekly_off"] and not point["holiday"] and point["date"] <= today:
            working_days += 1
        daily.append(
            {
                "date": point["date"],
                "weekly_off": point["weekly_off"],
                "holiday": point["holiday"],
                "at_office": c.get("At Office", 0),
                "work_from_home": c.get("WFH", 0),
                "on_duty": c.get("OD", 0),
                "weekend_or_holiday_working": c.get("WOW", 0) + c.get("HW", 0),
                "on_leave": c.get("FD Leave", 0) + c.get("HD Leave", 0),
                "comp_off": c.get("C/Off", 0),
                "absent": c.get("Absent", 0),
            }
        )
    by_type: dict[str, int] = defaultdict(int)
    for point in report.daily:
        for code, count in point["counts"].items():
            by_type[code] += count
    employees = len(report.people)
    expected = employees * working_days
    return {
        "month": month,
        "first_day": report.first,
        "last_day": report.last,
        "employees": employees,
        "working_days": working_days,
        "average_attendance_percent": (
            round(100 * totals.days_worked / expected, 1) if expected else None
        ),
        "average_minutes_per_day": totals.average_minutes,
        "late_arrivals": totals.late_count,
        "leave_days": totals.leave_days,
        "by_type": [
            {"code": code, "meaning": TYPES[code][0].split(" = ", 1)[1], "count": by_type[code]}
            for code in TYPES
            if by_type.get(code)
        ],
        "daily": daily,
        "people": people,
    }


async def leave_analytics(db: AsyncSession, start_year: int) -> dict:
    start, end = financial_year(start_year)
    today = company_today()
    users = await reportable_users(db, start, end)
    leaves = await _leaves(db, start, end, [u.id for u in users])
    by_user = {u.id: u for u in users}
    months: dict[str, dict] = {}
    day = start
    while day <= end:
        key = f"{day.year}-{day.month:02d}"
        months[key] = {
            "month": key,
            "leave_days": 0.0,
            "full_days": 0,
            "half_days": 0,
            "comp_off_days": 0,
        }
        day = (day.replace(day=28) + timedelta(days=4)).replace(day=1)
    people: dict[uuid.UUID, dict] = {}
    for (user_id, d), leave in sorted(leaves.items(), key=lambda kv: kv[0][1]):
        counted = leave_days(leave.leave_kind, d, d)
        point = months[f"{d.year}-{d.month:02d}"]
        row = people.setdefault(
            user_id,
            {
                "user_id": user_id,
                "name": by_user[user_id].name,
                "employee_code": by_user[user_id].employee_code,
                "leave_days": 0.0,
                "full_days": 0,
                "half_days": 0,
                "comp_off_days": 0,
                "upcoming_days": 0.0,
            },
        )
        point["leave_days"] += counted
        row["leave_days"] += counted
        if d > today:
            row["upcoming_days"] += counted
        if leave.leave_kind == "full_day":
            point["full_days"] += 1
            row["full_days"] += 1
        elif leave.leave_kind == "half_day":
            point["half_days"] += 1
            row["half_days"] += 1
        else:
            point["comp_off_days"] += 1
            row["comp_off_days"] += 1
    total = sum(r["leave_days"] for r in people.values())
    upcoming = sum(r["upcoming_days"] for r in people.values())
    return {
        "financial_year": start_year,
        "first_day": start,
        "last_day": end,
        "total_leave_days": total,
        "taken_days": total - upcoming,
        "upcoming_days": upcoming,
        "by_month": list(months.values()),
        "people": sorted(people.values(), key=lambda r: (-r["leave_days"], r["name"])),
    }
