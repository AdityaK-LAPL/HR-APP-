"""Machine business logic. See docs/api-contract.md section 11.

Visibility/edit scoping mirrors app/services/customer_service.py, scoped by
the machine's own customer_id instead of a foreign customer row.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, ConflictError, NotFoundError, ValidationFailedError
from app.models.customer import Customer
from app.models.machine import Machine
from app.models.service import ServiceAssignment, ServiceCall
from app.schemas.machine import MachineCreateRequest, MachineUpdateRequest
from app.schemas.principal import CurrentUser
from app.services.permission_service import in_scope


async def _get_machine(db: AsyncSession, machine_id: uuid.UUID) -> Machine:
    machine = (
        await db.execute(select(Machine).where(Machine.id == machine_id))
    ).scalar_one_or_none()
    if machine is None:
        raise NotFoundError("Machine not found.")
    return machine


async def _is_assigned_to_machine(
    db: AsyncSession, actor: CurrentUser, machine_id: uuid.UUID
) -> bool:
    stmt = (
        select(ServiceAssignment.id)
        .join(ServiceCall, ServiceCall.id == ServiceAssignment.service_call_id)
        .where(
            ServiceCall.machine_id == machine_id,
            ServiceAssignment.employee_id == actor.id,
            ServiceAssignment.is_active.is_(True),
        )
    )
    return (await db.execute(stmt)).first() is not None


async def can_edit_machine(db: AsyncSession, actor: CurrentUser, machine: Machine) -> bool:
    """Not underscore-prefixed: shared with app/services/attachment_service.py."""
    if actor.role == "owner":
        return True
    if actor.role != "manager":
        return False
    if machine.created_by == actor.id:
        return True
    manager_ids_stmt = select(ServiceCall.responsible_manager_id).where(
        ServiceCall.machine_id == machine.id
    )
    manager_ids = (await db.execute(manager_ids_stmt)).scalars().all()
    for manager_id in set(manager_ids):
        if manager_id == actor.id or await in_scope(db, actor, manager_id):
            return True
    return False


async def create_machine(
    db: AsyncSession, *, actor: CurrentUser, payload: MachineCreateRequest
) -> Machine:
    if actor.role not in ("owner", "manager"):
        raise AuthorizationError("You do not have permission to create machines.")

    customer = (
        await db.execute(select(Customer).where(Customer.id == payload.customer_id))
    ).scalar_one_or_none()
    if customer is None:
        raise ValidationFailedError("customer_id does not reference an existing customer.")

    existing = (
        await db.execute(select(Machine).where(Machine.machine_code == payload.machine_code))
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictError("machine_code is already in use.")

    machine = Machine(
        machine_code=payload.machine_code,
        customer_id=payload.customer_id,
        model_name=payload.model_name,
        serial_number=payload.serial_number,
        installation_date=payload.installation_date,
        purchase_info=payload.purchase_info,
        warranty_info=payload.warranty_info,
        location=payload.location,
        created_by=actor.id,
    )
    db.add(machine)
    await db.flush()
    return machine


async def get_machine(db: AsyncSession, *, actor: CurrentUser, machine_id: uuid.UUID) -> Machine:
    machine = await _get_machine(db, machine_id)
    if actor.role not in ("owner", "manager") and not await _is_assigned_to_machine(
        db, actor, machine_id
    ):
        raise AuthorizationError("You do not have permission to view this machine.")
    return machine


async def list_machines(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    customer_id: uuid.UUID | None,
    serial_number: str | None,
    model_name: str | None,
    page: int,
    page_size: int,
) -> tuple[list[Machine], int]:
    stmt = select(Machine)

    if actor.role not in ("owner", "manager"):
        assigned_machine_ids = (
            select(ServiceCall.machine_id)
            .join(ServiceAssignment, ServiceAssignment.service_call_id == ServiceCall.id)
            .where(ServiceAssignment.employee_id == actor.id, ServiceAssignment.is_active.is_(True))
        )
        stmt = stmt.where(Machine.id.in_(assigned_machine_ids))

    if customer_id is not None:
        stmt = stmt.where(Machine.customer_id == customer_id)
    if serial_number:
        stmt = stmt.where(Machine.serial_number.ilike(f"%{serial_number}%"))
    if model_name:
        stmt = stmt.where(Machine.model_name.ilike(f"%{model_name}%"))

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.order_by(Machine.machine_code).offset((page - 1) * page_size).limit(page_size)
    machines = (await db.execute(stmt)).scalars().all()
    return list(machines), total


async def update_machine(
    db: AsyncSession, *, actor: CurrentUser, machine_id: uuid.UUID, payload: MachineUpdateRequest
) -> Machine:
    machine = await _get_machine(db, machine_id)

    if payload.is_active is not None and actor.role != "owner":
        raise AuthorizationError("Only the Owner can deactivate a machine.")
    if not await can_edit_machine(db, actor, machine):
        raise AuthorizationError("You do not have permission to edit this machine.")

    if payload.model_name is not None:
        machine.model_name = payload.model_name
    if payload.serial_number is not None:
        machine.serial_number = payload.serial_number
    if payload.installation_date is not None:
        machine.installation_date = payload.installation_date
    if payload.purchase_info is not None:
        machine.purchase_info = payload.purchase_info
    if payload.warranty_info is not None:
        machine.warranty_info = payload.warranty_info
    if payload.location is not None:
        machine.location = payload.location
    if payload.status is not None:
        machine.status = payload.status
    if payload.is_active is not None:
        machine.is_active = payload.is_active

    await db.flush()
    return machine
