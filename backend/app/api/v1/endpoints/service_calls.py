"""Service call, assignment, visit, and report endpoints - see
docs/api-contract.md sections 12-14.

Service history (context.md section 23: Customer -> Machines -> Service
Calls -> Reports) is reached by chaining the existing list endpoints
(`GET /machines?customer_id=`, `GET /service-calls?customer_id=` or
`?machine_id=`, `GET /service-calls/{id}/reports`) rather than a separate
duplicate endpoint - see docs/api-contract.md section 12 note.
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas.principal import CurrentUser
from app.schemas.service import (
    ServiceAssignmentCreateRequest,
    ServiceAssignmentResponse,
    ServiceCallCreateRequest,
    ServiceCallListResponse,
    ServiceCallResponse,
    ServiceCallUpdateRequest,
    ServiceReportCreateRequest,
    ServiceReportResponse,
    ServiceReportReviewRequest,
    ServiceVisitCreateRequest,
    ServiceVisitResponse,
    ServiceVisitUpdateRequest,
)
from app.services import service_call_service, service_report_service, service_visit_service

router = APIRouter(tags=["service-calls"])


@router.get("/service-calls", response_model=ServiceCallListResponse)
async def list_service_calls(
    customer_id: uuid.UUID | None = None,
    machine_id: uuid.UUID | None = None,
    employee_id: uuid.UUID | None = None,
    manager_id: uuid.UUID | None = None,
    status_: str | None = Query(None, alias="status"),
    service_call_code: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ServiceCallListResponse:
    calls, total = await service_call_service.list_service_calls(
        db,
        actor=current_user,
        customer_id=customer_id,
        machine_id=machine_id,
        employee_id=employee_id,
        manager_id=manager_id,
        status=status_,
        service_call_code=service_call_code,
        page=page,
        page_size=page_size,
    )
    return ServiceCallListResponse(
        items=[ServiceCallResponse.model_validate(c) for c in calls],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/service-calls", response_model=ServiceCallResponse, status_code=status.HTTP_201_CREATED
)
async def create_service_call(
    payload: ServiceCallCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ServiceCallResponse:
    call = await service_call_service.create_service_call(db, actor=current_user, payload=payload)
    return ServiceCallResponse.model_validate(call)


@router.get("/service-calls/{service_call_id}", response_model=ServiceCallResponse)
async def get_service_call(
    service_call_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ServiceCallResponse:
    call = await service_call_service.get_service_call(
        db, actor=current_user, service_call_id=service_call_id
    )
    return ServiceCallResponse.model_validate(call)


@router.patch("/service-calls/{service_call_id}", response_model=ServiceCallResponse)
async def update_service_call(
    service_call_id: uuid.UUID,
    payload: ServiceCallUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ServiceCallResponse:
    call = await service_call_service.update_service_call(
        db, actor=current_user, service_call_id=service_call_id, payload=payload
    )
    return ServiceCallResponse.model_validate(call)


@router.get(
    "/service-calls/{service_call_id}/assignments", response_model=list[ServiceAssignmentResponse]
)
async def list_assignments(
    service_call_id: uuid.UUID,
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[ServiceAssignmentResponse]:
    assignments = await service_call_service.list_assignments(
        db, actor=current_user, service_call_id=service_call_id, active_only=active_only
    )
    return [ServiceAssignmentResponse.model_validate(a) for a in assignments]


@router.post(
    "/service-calls/{service_call_id}/assign",
    response_model=ServiceAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_employee(
    service_call_id: uuid.UUID,
    payload: ServiceAssignmentCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ServiceAssignmentResponse:
    assignment = await service_call_service.assign_employee(
        db, actor=current_user, service_call_id=service_call_id, payload=payload
    )
    return ServiceAssignmentResponse.model_validate(assignment)


@router.delete(
    "/service-calls/{service_call_id}/assign/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unassign_employee(
    service_call_id: uuid.UUID,
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    await service_call_service.unassign_employee(
        db, actor=current_user, service_call_id=service_call_id, assignment_id=assignment_id
    )


@router.post(
    "/service-calls/{service_call_id}/visits",
    response_model=ServiceVisitResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_visit(
    service_call_id: uuid.UUID,
    payload: ServiceVisitCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ServiceVisitResponse:
    visit = await service_visit_service.create_visit(
        db, actor=current_user, service_call_id=service_call_id, payload=payload
    )
    return ServiceVisitResponse.model_validate(visit)


@router.get("/service-calls/{service_call_id}/visits", response_model=list[ServiceVisitResponse])
async def list_visits(
    service_call_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[ServiceVisitResponse]:
    visits = await service_visit_service.list_visits(
        db, actor=current_user, service_call_id=service_call_id
    )
    return [ServiceVisitResponse.model_validate(v) for v in visits]


@router.patch("/service-visits/{visit_id}", response_model=ServiceVisitResponse)
async def update_visit(
    visit_id: uuid.UUID,
    payload: ServiceVisitUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ServiceVisitResponse:
    visit = await service_visit_service.update_visit(
        db, actor=current_user, visit_id=visit_id, payload=payload
    )
    return ServiceVisitResponse.model_validate(visit)


@router.post(
    "/service-calls/{service_call_id}/report",
    response_model=ServiceReportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_report(
    service_call_id: uuid.UUID,
    payload: ServiceReportCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ServiceReportResponse:
    report = await service_report_service.submit_report(
        db, actor=current_user, service_call_id=service_call_id, payload=payload
    )
    return ServiceReportResponse.model_validate(report)


@router.get("/service-calls/{service_call_id}/reports", response_model=list[ServiceReportResponse])
async def list_reports(
    service_call_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[ServiceReportResponse]:
    reports = await service_report_service.list_reports(
        db, actor=current_user, service_call_id=service_call_id
    )
    return [ServiceReportResponse.model_validate(r) for r in reports]


@router.get("/service-reports/{report_id}", response_model=ServiceReportResponse)
async def get_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ServiceReportResponse:
    report = await service_report_service.get_report(db, actor=current_user, report_id=report_id)
    return ServiceReportResponse.model_validate(report)


@router.post("/service-reports/{report_id}/review", response_model=ServiceReportResponse)
async def review_report(
    report_id: uuid.UUID,
    payload: ServiceReportReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ServiceReportResponse:
    report = await service_report_service.review_report(
        db, actor=current_user, report_id=report_id, comments=payload.comments
    )
    return ServiceReportResponse.model_validate(report)
