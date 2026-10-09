"""Customer and customer-contact business logic. See docs/api-contract.md
section 10.

Resolved default for Open Question 2: Owner and any Manager can view and
create customers (they need to search the directory to log a new service
call for any customer, not only ones already tied to them); Employees see
only customers reachable through an active service call assignment.
Editing a customer is narrower than viewing it - see _can_edit_customer.
"""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, ConflictError, NotFoundError
from app.models.customer import Customer, CustomerContact
from app.models.machine import Machine
from app.models.service import ServiceAssignment, ServiceCall
from app.schemas.customer import (
    CustomerContactCreateRequest,
    CustomerContactUpdateRequest,
    CustomerCreateRequest,
    CustomerUpdateRequest,
)
from app.schemas.principal import CurrentUser
from app.services.permission_service import in_scope
from app.services.search import ESCAPE, like_pattern


async def _get_customer(db: AsyncSession, customer_id: uuid.UUID) -> Customer:
    customer = (
        await db.execute(select(Customer).where(Customer.id == customer_id))
    ).scalar_one_or_none()
    if customer is None:
        raise NotFoundError("Customer not found.")
    return customer


async def _is_assigned_to_customer(
    db: AsyncSession, actor: CurrentUser, customer_id: uuid.UUID
) -> bool:
    stmt = (
        select(ServiceAssignment.id)
        .join(ServiceCall, ServiceCall.id == ServiceAssignment.service_call_id)
        .where(
            ServiceCall.customer_id == customer_id,
            ServiceAssignment.employee_id == actor.id,
            ServiceAssignment.is_active.is_(True),
        )
    )
    return (await db.execute(stmt)).first() is not None


async def can_edit_customer(db: AsyncSession, actor: CurrentUser, customer: Customer) -> bool:
    """Not underscore-prefixed: shared with app/services/attachment_service.py."""
    if actor.role == "owner":
        return True
    if actor.role != "manager":
        return False
    if customer.created_by == actor.id:
        return True
    manager_ids_stmt = select(ServiceCall.responsible_manager_id).where(
        ServiceCall.customer_id == customer.id
    )
    manager_ids = (await db.execute(manager_ids_stmt)).scalars().all()
    for manager_id in set(manager_ids):
        if manager_id == actor.id or await in_scope(db, actor, manager_id):
            return True
    return False


async def create_customer(
    db: AsyncSession, *, actor: CurrentUser, payload: CustomerCreateRequest
) -> Customer:
    if actor.role not in ("owner", "manager"):
        raise AuthorizationError("You do not have permission to create customers.")

    existing = (
        await db.execute(select(Customer).where(Customer.customer_code == payload.customer_code))
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictError("customer_code is already in use.")

    customer = Customer(
        customer_code=payload.customer_code,
        name=payload.name,
        address=payload.address,
        notes=payload.notes,
        created_by=actor.id,
    )
    db.add(customer)
    await db.flush()
    return customer


async def get_customer(db: AsyncSession, *, actor: CurrentUser, customer_id: uuid.UUID) -> Customer:
    customer = await _get_customer(db, customer_id)
    if actor.role not in ("owner", "manager") and not await _is_assigned_to_customer(
        db, actor, customer_id
    ):
        raise AuthorizationError("You do not have permission to view this customer.")
    return customer


async def list_contacts(
    db: AsyncSession, *, actor: CurrentUser, customer_id: uuid.UUID
) -> list[CustomerContact]:
    await get_customer(db, actor=actor, customer_id=customer_id)
    stmt = (
        select(CustomerContact)
        .where(CustomerContact.customer_id == customer_id)
        .order_by(CustomerContact.is_primary.desc(), CustomerContact.name)
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_customers(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    name: str | None,
    customer_code: str | None,
    contact: str | None,
    machine_serial: str | None,
    page: int,
    page_size: int,
) -> tuple[list[Customer], int]:
    stmt = select(Customer)

    if actor.role not in ("owner", "manager"):
        assigned_customer_ids = (
            select(ServiceCall.customer_id)
            .join(ServiceAssignment, ServiceAssignment.service_call_id == ServiceCall.id)
            .where(ServiceAssignment.employee_id == actor.id, ServiceAssignment.is_active.is_(True))
        )
        stmt = stmt.where(Customer.id.in_(assigned_customer_ids))

    if name:
        stmt = stmt.where(Customer.name.ilike(like_pattern(name), escape=ESCAPE))
    if customer_code:
        stmt = stmt.where(Customer.customer_code.ilike(like_pattern(customer_code), escape=ESCAPE))
    if contact:
        pattern = like_pattern(contact)
        contact_match = select(CustomerContact.id).where(
            CustomerContact.customer_id == Customer.id,
            or_(
                CustomerContact.name.ilike(pattern, escape=ESCAPE),
                CustomerContact.phone.ilike(pattern, escape=ESCAPE),
                CustomerContact.email.ilike(pattern, escape=ESCAPE),
            ),
        )
        stmt = stmt.where(contact_match.exists())
    if machine_serial:
        machine_match = select(Machine.id).where(
            Machine.customer_id == Customer.id,
            Machine.serial_number.ilike(like_pattern(machine_serial), escape=ESCAPE),
        )
        stmt = stmt.where(machine_match.exists())

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.order_by(Customer.name).offset((page - 1) * page_size).limit(page_size)
    customers = (await db.execute(stmt)).scalars().all()
    return list(customers), total


async def update_customer(
    db: AsyncSession, *, actor: CurrentUser, customer_id: uuid.UUID, payload: CustomerUpdateRequest
) -> Customer:
    customer = await _get_customer(db, customer_id)

    if payload.is_active is not None and actor.role != "owner":
        raise AuthorizationError("Only the Owner can deactivate a customer.")
    if not await can_edit_customer(db, actor, customer):
        raise AuthorizationError("You do not have permission to edit this customer.")

    if payload.name is not None:
        customer.name = payload.name
    if payload.address is not None:
        customer.address = payload.address
    if payload.notes is not None:
        customer.notes = payload.notes
    if payload.is_active is not None:
        customer.is_active = payload.is_active

    await db.flush()
    return customer


async def add_contact(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    customer_id: uuid.UUID,
    payload: CustomerContactCreateRequest,
) -> CustomerContact:
    customer = await _get_customer(db, customer_id)
    if not await can_edit_customer(db, actor, customer):
        raise AuthorizationError("You do not have permission to edit this customer.")

    contact = CustomerContact(
        customer_id=customer_id,
        name=payload.name,
        designation=payload.designation,
        phone=payload.phone,
        email=payload.email,
        is_primary=payload.is_primary,
    )
    db.add(contact)
    await db.flush()
    return contact


async def update_contact(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    customer_id: uuid.UUID,
    contact_id: uuid.UUID,
    payload: CustomerContactUpdateRequest,
) -> CustomerContact:
    customer = await _get_customer(db, customer_id)
    if not await can_edit_customer(db, actor, customer):
        raise AuthorizationError("You do not have permission to edit this customer.")

    contact = (
        await db.execute(
            select(CustomerContact).where(
                CustomerContact.id == contact_id, CustomerContact.customer_id == customer_id
            )
        )
    ).scalar_one_or_none()
    if contact is None:
        raise NotFoundError("Contact not found.")

    if payload.name is not None:
        contact.name = payload.name
    if payload.designation is not None:
        contact.designation = payload.designation
    if payload.phone is not None:
        contact.phone = payload.phone
    if payload.email is not None:
        contact.email = payload.email
    if payload.is_primary is not None:
        contact.is_primary = payload.is_primary

    await db.flush()
    return contact
