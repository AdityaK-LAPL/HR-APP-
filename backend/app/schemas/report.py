import uuid

from pydantic import BaseModel


class AttendanceReportRow(BaseModel):
    user_id: uuid.UUID
    days_present: int
    total_minutes: int


class StatusCount(BaseModel):
    status: str
    count: int


class TaskReportResponse(BaseModel):
    by_status: list[StatusCount]
    total: int


class LeaveReportResponse(BaseModel):
    by_status: list[StatusCount]
    total: int


class WorkloadRow(BaseModel):
    user_id: uuid.UUID
    open_task_count: int
    active_service_assignment_count: int


class ServiceActivityReportResponse(BaseModel):
    by_status: list[StatusCount]
    total_calls: int
    average_resolution_minutes: float | None
