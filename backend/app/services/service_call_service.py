"""Service call and assignment business logic. See docs/api-contract.md
section 12 and context.md sections 16-18.

A service call must be created immediately on customer contact (context.md
section 16) - there is deliberately no draft/staging state. Reassigning
employees preserves prior `service_assignments` rows (deactivated, not
deleted) rather than overwriting them, per context.md section 18.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, ConflictError, NotFoundError, ValidationFailedError
from app.models.customer import Customer
from app.models.identity import ManagerHierarchyClosure
from app.models.machine import Machine
from app.models.service import ServiceAssignment, ServiceCall
from app.schemas.principal import CurrentUser
from app.schemas.service import (
    ServiceAssignmentCreateRequest,
    ServiceCallCreateRequest,
    ServiceCallUpdateRequest,
)
from app.services.audit_service import record_audit_log
from app.services.permission_service import has_permission, in_scope
from app.services.search import ESCAPE, like_pattern
from app.services.user_lookup import get_user_stub


async def fetch_call(db: AsyncSession, service_call_id: uuid.UUID) -> ServiceCall:
    """Shared with app/services/service_visit_service.py and
    service_report_service.py - not prefixed with an underscore because it
    (and the other non-leading-underscore helpers below) form this
    service-call domain's internal API across those sibling modules."""

    call = (
        await db.execute(select(ServiceCall).where(ServiceCall.id == service_call_id))
    ).scalar_one_or_none()
    if call is None:
        raise NotFoundError("Service call not found.")
    return call


async def is_assigned_to_call(
    db: AsyncSession, actor: CurrentUser, service_call_id: uuid.UUID
) -> bool:
    stmt = select(ServiceAssignment.id).where(
        ServiceAssignment.service_call_id == service_call_id,
        ServiceAssignment.employee_id == actor.id,
        ServiceAssignment.is_active.is_(True),
    )
    return (await db.execute(stmt)).first() is not None


async def can_manage_call(db: AsyncSession, actor: CurrentUser, call: ServiceCall) -> bool:
    if actor.role == "owner":
        return True
    if actor.role != "manager":
        return False
    return call.responsible_manager_id == actor.id or await in_scope(
        db, actor, call.responsible_manager_id
    )


async def can_view_call(db: AsyncSession, actor: CurrentUser, call: ServiceCall) -> bool:
    if await can_manage_call(db, actor, call):
        return True
    if await is_assigned_to_call(db, actor, call.id):
        return True
    if actor.role == "manager":
        assigned_ids_stmt = select(ServiceAssignment.employee_id).where(
            ServiceAssignment.service_call_id == call.id, ServiceAssignment.is_active.is_(True)
        )
        assigned_ids = (await db.execute(assigned_ids_stmt)).scalars().all()
        for employee_id in set(assigned_ids):
            if await in_scope(db, actor, employee_id):
                return True
    return False


async def _can_assign(db: AsyncSession, actor: CurrentUser, call: ServiceCall) -> bool:
    if await can_manage_call(db, actor, call):
        return True
    if actor.role == "manager":
        return await has_permission(
            db,
            actor,
            "assign_employees_to_service_call",
            scope_type="user",
            scope_id=call.responsible_manager_id,
        )
    return False


async def create_service_call(
    db: AsyncSession, *, actor: CurrentUser, payload: ServiceCallCreateRequest
) -> ServiceCall:
    if actor.role not in ("owner", "manager"):
        raise AuthorizationError("You do not have permission to create service calls.")

    customer = (
        await db.execute(select(Customer).where(Customer.id == payload.customer_id))
    ).scalar_one_or_none()
    if customer is None:
        raise ValidationFailedError("customer_id does not reference an existing customer.")

    machine = (
        await db.execute(select(Machine).where(Machine.id == payload.machine_id))
    ).scalar_one_or_none()
    if machine is None or machine.customer_id != payload.customer_id:
        raise ValidationFailedError(
            "machine_id does not reference a machine belonging to this customer."
        )

    existing = (
        await db.execute(
            select(ServiceCall).where(ServiceCall.service_call_code == payload.service_call_code)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictError("service_call_code is already in use.")

    if payload.responsible_manager_id is not None:
        responsible_manager_id = payload.responsible_manager_id
        manager = await get_user_stub(db, responsible_manager_id)
        if manager is None or manager.role not in ("owner", "manager"):
            raise ValidationFailedError(
                "responsible_manager_id must reference an Owner or Manager."
            )
        if actor.role == "manager" and not (
            responsible_manager_id == actor.id or await in_scope(db, actor, responsible_manager_id)
        ):
            raise AuthorizationError(
                "You cannot assign responsibility to a manager outside your scope."
            )
    else:
        responsible_manager_id = actor.id

    call = ServiceCall(
        service_call_code=payload.service_call_code,
        customer_id=payload.customer_id,
        machine_id=payload.machine_id,
        reported_by_contact_id=payload.reported_by_contact_id,
        contacted_at=payload.contacted_at,
        contact_method=payload.contact_method,
        issue_reported=payload.issue_reported,
        priority=payload.priority,
        service_type=payload.service_type,
        responsible_manager_id=responsible_manager_id,
    )
    db.add(call)
    await db.flush()

    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="service_call.created",
        entity_type="service_call",
        entity_id=call.id,
        new_value={
            "service_call_code": call.service_call_code,
            "customer_id": str(call.customer_id),
            "machine_id": str(call.machine_id),
        },
    )
    await db.flush()
    return call


async def get_service_call(
    db: AsyncSession, *, actor: CurrentUser, service_call_id: uuid.UUID
) -> ServiceCall:
    call = await fetch_call(db, service_call_id)
    if not await can_view_call(db, actor, call):
        raise AuthorizationError("You do not have permission to view this service call.")
    return call


async def list_service_calls(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    customer_id: uuid.UUID | None,
    machine_id: uuid.UUID | None,
    employee_id: uuid.UUID | None,
    manager_id: uuid.UUID | None,
    status: str | None,
    service_call_code: str | None,
    page: int,
    page_size: int,
) -> tuple[list[ServiceCall], int]:
    stmt = select(ServiceCall)

    if actor.role == "manager":
        subtree_ids = select(ManagerHierarchyClosure.descendant_id).where(
            ManagerHierarchyClosure.ancestor_id == actor.id
        )
        assigned_call_ids = select(ServiceAssignment.service_call_id).where(
            ServiceAssignment.is_active.is_(True), ServiceAssignment.employee_id.in_(subtree_ids)
        )
        stmt = stmt.where(
            ServiceCall.responsible_manager_id.in_(subtree_ids)
            | ServiceCall.id.in_(assigned_call_ids)
        )
    elif actor.role != "owner":
        assigned_call_ids = select(ServiceAssignment.service_call_id).where(
            ServiceAssignment.is_active.is_(True), ServiceAssignment.employee_id == actor.id
        )
        stmt = stmt.where(ServiceCall.id.in_(assigned_call_ids))

    if customer_id is not None:
        stmt = stmt.where(ServiceCall.customer_id == customer_id)
    if machine_id is not None:
        stmt = stmt.where(ServiceCall.machine_id == machine_id)
    if manager_id is not None:
        stmt = stmt.where(ServiceCall.responsible_manager_id == manager_id)
    if status is not None:
        stmt = stmt.where(ServiceCall.status == status)
    if service_call_code:
        stmt = stmt.where(
            ServiceCall.service_call_code.ilike(like_pattern(service_call_code), escape=ESCAPE)
        )
    if employee_id is not None:
        employee_call_ids = select(ServiceAssignment.service_call_id).where(
            ServiceAssignment.employee_id == employee_id, ServiceAssignment.is_active.is_(True)
        )
        stmt = stmt.where(ServiceCall.id.in_(employee_call_ids))

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.order_by(ServiceCall.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    calls = (await db.execute(stmt)).scalars().all()
    return list(calls), total


async def update_service_call(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    service_call_id: uuid.UUID,
    payload: ServiceCallUpdateRequest,
) -> ServiceCall:
    call = await fetch_call(db, service_call_id)

    can_manage = await can_manage_call(db, actor, call)
    is_assigned = await is_assigned_to_call(db, actor, call.id)

    if not can_manage and not is_assigned:
        raise AuthorizationError("You do not have permission to modify this service call.")

    if not can_manage:
        other_fields_set = any(
            [
                payload.issue_reported is not None,
                payload.priority is not None,
                payload.resolution is not None,
                payload.responsible_manager_id is not None,
            ]
        )
        if other_fields_set:
            raise AuthorizationError(
                "You may only update the status of a service call you're assigned to."
            )

    if payload.responsible_manager_id is not None:
        if actor.role != "owner":
            raise AuthorizationError(
                "Only the Owner can reassign overall responsibility for a service call."
            )
        manager = await get_user_stub(db, payload.responsible_manager_id)
        if manager is None or manager.role not in ("owner", "manager"):
            raise ValidationFailedError(
                "responsible_manager_id must reference an Owner or Manager."
            )
        call.responsible_manager_id = payload.responsible_manager_id

    old_status = call.status
    if payload.issue_reported is not None:
        call.issue_reported = payload.issue_reported
    if payload.priority is not None:
        call.priority = payload.priority
    if payload.status is not None:
        call.status = payload.status
    if payload.resolution is not None:
        call.resolution = payload.resolution

    await db.flush()

    if payload.status is not None and payload.status != old_status:
        await record_audit_log(
            db,
            actor_user_id=actor.id,
            action="service_call.status_changed",
            entity_type="service_call",
            entity_id=call.id,
            old_value={"status": old_status},
            new_value={"status": call.status},
        )
        await db.flush()

    return call


async def list_assignments(
    db: AsyncSession, *, actor: CurrentUser, service_call_id: uuid.UUID, active_only: bool = True
) -> list[ServiceAssignment]:
    # Not in the original design sketch - there was otherwise no way to
    # see who is currently assigned to a call without already knowing an
    # assignment_id (e.g. after a page reload).
    call = await fetch_call(db, service_call_id)
    if not await can_view_call(db, actor, call):
        raise AuthorizationError("You do not have permission to view this service call.")

    stmt = select(ServiceAssignment).where(ServiceAssignment.service_call_id == service_call_id)
    if active_only:
        stmt = stmt.where(ServiceAssignment.is_active.is_(True))
    stmt = stmt.order_by(ServiceAssignment.assigned_at.desc())
    return list((await db.execute(stmt)).scalars().all())


async def assign_employee(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    service_call_id: uuid.UUID,
    payload: ServiceAssignmentCreateRequest,
) -> ServiceAssignment:
    call = await fetch_call(db, service_call_id)
    if not await _can_assign(db, actor, call):
        raise AuthorizationError(
            "You do not have permission to assign employees to this service call."
        )

    employee = await get_user_stub(db, payload.employee_id)
    if employee is None or not employee.is_active:
        raise ValidationFailedError("employee_id does not reference an active user.")

    assignment = ServiceAssignment(
        service_call_id=service_call_id,
        employee_id=payload.employee_id,
        assigned_by=actor.id,
        role_in_call=payload.role_in_call,
    )
    db.add(assignment)
    await db.flush()

    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="service_call.employee_assigned",
        entity_type="service_call",
        entity_id=call.id,
        new_value={"employee_id": str(payload.employee_id), "role_in_call": payload.role_in_call},
    )
    await db.flush()
    return assignment


async def unassign_employee(
    db: AsyncSession, *, actor: CurrentUser, service_call_id: uuid.UUID, assignment_id: uuid.UUID
) -> None:
    call = await fetch_call(db, service_call_id)
    if not await _can_assign(db, actor, call):
        raise AuthorizationError(
            "You do not have permission to change this service call's assignments."
        )

    assignment = (
        await db.execute(
            select(ServiceAssignment).where(
                ServiceAssignment.id == assignment_id,
                ServiceAssignment.service_call_id == service_call_id,
                ServiceAssignment.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if assignment is None:
        raise NotFoundError("Active assignment not found.")

    assignment.is_active = False
    assignment.unassigned_at = datetime.now(UTC)
    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="service_call.employee_unassigned",
        entity_type="service_call",
        entity_id=call.id,
        old_value={"employee_id": str(assignment.employee_id)},
    )
    await db.flush()
