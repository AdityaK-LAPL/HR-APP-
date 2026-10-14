import uuid
from datetime import date

from pydantic import BaseModel


class TypeCount(BaseModel):
    code: str
    meaning: str
    count: int


class DailyAttendancePoint(BaseModel):
    date: date
    weekly_off: bool
    holiday: bool
    at_office: int
    work_from_home: int
    on_duty: int
    weekend_or_holiday_working: int
    on_leave: int
    comp_off: int
    absent: int


class PersonAttendanceRow(BaseModel):
    user_id: uuid.UUID
    name: str
    employee_code: str
    days_worked: float
    at_office: int
    work_from_home: int
    on_duty: int
    weekend_or_holiday_working: int
    leave_days: float
    comp_off: int
    absent: int
    total_minutes: int
    average_minutes: int | None
    late_count: int
    average_in_minute: int | None  # minutes after midnight, company time


class AttendanceAnalyticsResponse(BaseModel):
    month: str
    first_day: date
    last_day: date
    employees: int
    working_days: int  # days up to today that are neither a weekly off nor a holiday
    average_attendance_percent: float | None
    average_minutes_per_day: int | None
    late_arrivals: int
    leave_days: float
    by_type: list[TypeCount]
    daily: list[DailyAttendancePoint]
    people: list[PersonAttendanceRow]


class LeaveMonthPoint(BaseModel):
    month: str  # YYYY-MM
    leave_days: float
    full_days: int
    half_days: int
    comp_off_days: int


class PersonLeaveRow(BaseModel):
    user_id: uuid.UUID
    name: str
    employee_code: str
    leave_days: float
    full_days: int
    half_days: int
    comp_off_days: int
    upcoming_days: float


class LeaveAnalyticsResponse(BaseModel):
    financial_year: int  # the year it starts in: 2026 = April 2026 - March 2027
    first_day: date
    last_day: date
    total_leave_days: float
    taken_days: float
    upcoming_days: float
    by_month: list[LeaveMonthPoint]
    people: list[PersonLeaveRow]
