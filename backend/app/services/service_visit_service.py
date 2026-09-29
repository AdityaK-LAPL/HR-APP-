"""Service visit business logic (field visits & online support sessions).
See docs/api-contract.md section 13 and context.md sections 19-20.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, NotFoundError
from app.models.service import ServiceVisit
from app.schemas.principal import CurrentUser
from app.schemas.service import ServiceVisitCreateRequest, ServiceVisitUpdateRequest
from app.services.service_call_service import (
    can_manage_call,
    can_view_call,
    fetch_call,
    is_assigned_to_call,
)

VISIT_UPDATE_FIELDS = (
    "visit_date",
    "arrival_time",
    "departure_time",
    "latitude",
    "longitude",
    "work_performed",
    "problem_found",
    "parts_used",
    "action_taken",
    "result",
    "customer_signoff",
)


async def create_visit(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    service_call_id: uuid.UUID,
    payload: ServiceVisitCreateRequest,
) -> ServiceVisit:
    call = await fetch_call(db, service_call_id)

    allowed = await is_assigned_to_call(db, actor, service_call_id) or await can_manage_call(
        db, actor, call
    )
    if not allowed:
        raise AuthorizationError(
            "You do not have permission to record a visit on this service call."
        )

    visit = ServiceVisit(
        service_call_id=service_call_id,
        employee_id=actor.id,
        visit_type=payload.visit_type,
        visit_date=payload.visit_date,
        arrival_time=payload.arrival_time,
        departure_time=payload.departure_time,
        latitude=payload.latitude,
        longitude=payload.longitude,
        work_performed=payload.work_performed,
        problem_found=payload.problem_found,
        parts_used=payload.parts_used,
        action_taken=payload.action_taken,
        result=payload.result,
        customer_signoff=payload.customer_signoff,
    )
    db.add(visit)
    await db.flush()
    return visit


async def list_visits(
    db: AsyncSession, *, actor: CurrentUser, service_call_id: uuid.UUID
) -> list[ServiceVisit]:
    call = await fetch_call(db, service_call_id)
    if not await can_view_call(db, actor, call):
        raise AuthorizationError("You do not have permission to view this service call.")

    stmt = (
        select(ServiceVisit)
        .where(ServiceVisit.service_call_id == service_call_id)
        .order_by(ServiceVisit.created_at)
    )
    return list((await db.execute(stmt)).scalars().all())


async def update_visit(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    visit_id: uuid.UUID,
    payload: ServiceVisitUpdateRequest,
) -> ServiceVisit:
    visit = (
        await db.execute(select(ServiceVisit).where(ServiceVisit.id == visit_id))
    ).scalar_one_or_none()
    if visit is None:
        raise NotFoundError("Service visit not found.")

    call = await fetch_call(db, visit.service_call_id)
    if visit.employee_id != actor.id and not await can_manage_call(db, actor, call):
        raise AuthorizationError("You do not have permission to edit this visit.")

    for field in VISIT_UPDATE_FIELDS:
        value = getattr(payload, field)
        if value is not None:
            setattr(visit, field, value)

    await db.flush()
    return visit
