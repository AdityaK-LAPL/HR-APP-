import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.service import (
    CONTACT_METHODS,
    SERVICE_CALL_STATUSES,
    SERVICE_TYPES,
    VISIT_TYPES,
)

PRIORITIES = ("low", "medium", "high", "urgent")


class ServiceCallCreateRequest(BaseModel):
    service_call_code: str = Field(..., min_length=1, max_length=50)
    customer_id: uuid.UUID
    machine_id: uuid.UUID
    reported_by_contact_id: uuid.UUID | None = None
    contacted_at: datetime
    contact_method: str
    issue_reported: str = Field(..., min_length=1)
    priority: str = "medium"
    service_type: str
    responsible_manager_id: uuid.UUID | None = None

    @field_validator("contact_method")
    @classmethod
    def validate_contact_method(cls, value: str) -> str:
        if value not in CONTACT_METHODS:
            raise ValueError(f"contact_method must be one of {CONTACT_METHODS}")
        return value

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str) -> str:
        if value not in PRIORITIES:
            raise ValueError(f"priority must be one of {PRIORITIES}")
        return value

    @field_validator("service_type")
    @classmethod
    def validate_service_type(cls, value: str) -> str:
        if value not in SERVICE_TYPES:
            raise ValueError(f"service_type must be one of {SERVICE_TYPES}")
        return value


class ServiceCallUpdateRequest(BaseModel):
    issue_reported: str | None = None
    priority: str | None = None
    status: str | None = None
    resolution: str | None = None
    responsible_manager_id: uuid.UUID | None = None

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str | None) -> str | None:
        if value is not None and value not in PRIORITIES:
            raise ValueError(f"priority must be one of {PRIORITIES}")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None and value not in SERVICE_CALL_STATUSES:
            raise ValueError(f"status must be one of {SERVICE_CALL_STATUSES}")
        return value


class ServiceCallResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    service_call_code: str
    customer_id: uuid.UUID
    machine_id: uuid.UUID
    reported_by_contact_id: uuid.UUID | None
    contacted_at: datetime
    contact_method: str
    issue_reported: str
    priority: str
    service_type: str
    responsible_manager_id: uuid.UUID
    status: str
    resolution: str | None
    created_at: datetime
    updated_at: datetime


class ServiceCallListResponse(BaseModel):
    items: list[ServiceCallResponse]
    total: int
    page: int
    page_size: int


class ServiceAssignmentCreateRequest(BaseModel):
    employee_id: uuid.UUID
    role_in_call: str | None = Field(None, max_length=100)


class ServiceAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    service_call_id: uuid.UUID
    employee_id: uuid.UUID
    assigned_by: uuid.UUID
    assigned_at: datetime
    role_in_call: str | None
    is_active: bool
    unassigned_at: datetime | None


class ServiceVisitCreateRequest(BaseModel):
    visit_type: str
    visit_date: date | None = None
    arrival_time: datetime | None = None
    departure_time: datetime | None = None
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    work_performed: str | None = None
    problem_found: str | None = None
    parts_used: str | None = None
    action_taken: str | None = None
    result: str | None = None
    customer_signoff: str | None = None

    @field_validator("visit_type")
    @classmethod
    def validate_visit_type(cls, value: str) -> str:
        if value not in VISIT_TYPES:
            raise ValueError(f"visit_type must be one of {VISIT_TYPES}")
        return value


class ServiceVisitUpdateRequest(BaseModel):
    visit_date: date | None = None
    arrival_time: datetime | None = None
    departure_time: datetime | None = None
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    work_performed: str | None = None
    problem_found: str | None = None
    parts_used: str | None = None
    action_taken: str | None = None
    result: str | None = None
    customer_signoff: str | None = None


class ServiceVisitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    service_call_id: uuid.UUID
    employee_id: uuid.UUID
    visit_type: str
    visit_date: date | None
    arrival_time: datetime | None
    departure_time: datetime | None
    latitude: float | None
    longitude: float | None
    work_performed: str | None
    problem_found: str | None
    parts_used: str | None
    action_taken: str | None
    result: str | None
    customer_signoff: str | None
    created_at: datetime


class ServiceReportCreateRequest(BaseModel):
    service_visit_id: uuid.UUID | None = None
    report_datetime: datetime | None = None
    work_performed: str | None = None
    problem_found: str | None = None
    root_cause: str | None = None
    action_taken: str | None = None
    parts_used: str | None = None
    result: str | None = None
    pending_work: str | None = None
    recommendations: str | None = None
    employee_comments: str | None = None


class ServiceReportReviewRequest(BaseModel):
    comments: str | None = None


class ServiceReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    service_call_id: uuid.UUID
    service_visit_id: uuid.UUID | None
    employee_id: uuid.UUID
    report_datetime: datetime
    service_type: str | None
    work_performed: str | None
    problem_found: str | None
    root_cause: str | None
    action_taken: str | None
    parts_used: str | None
    result: str | None
    pending_work: str | None
    recommendations: str | None
    employee_comments: str | None
    reviewed_by: uuid.UUID | None
    reviewed_at: datetime | None
    submitted_at: datetime
