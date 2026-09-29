"""Customer endpoints - see docs/api-contract.md section 10."""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas.customer import (
    CustomerContactCreateRequest,
    CustomerContactResponse,
    CustomerContactUpdateRequest,
    CustomerCreateRequest,
    CustomerListResponse,
    CustomerResponse,
    CustomerUpdateRequest,
)
from app.schemas.principal import CurrentUser
from app.services import customer_service

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=CustomerListResponse)
async def list_customers(
    name: str | None = None,
    customer_code: str | None = None,
    contact: str | None = None,
    machine_serial: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> CustomerListResponse:
    customers, total = await customer_service.list_customers(
        db,
        actor=current_user,
        name=name,
        customer_code=customer_code,
        contact=contact,
        machine_serial=machine_serial,
        page=page,
        page_size=page_size,
    )
    return CustomerListResponse(
        items=[CustomerResponse.model_validate(c) for c in customers],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CustomerCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> CustomerResponse:
    customer = await customer_service.create_customer(db, actor=current_user, payload=payload)
    return CustomerResponse.model_validate(customer)


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> CustomerResponse:
    customer = await customer_service.get_customer(db, actor=current_user, customer_id=customer_id)
    return CustomerResponse.model_validate(customer)


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> CustomerResponse:
    customer = await customer_service.update_customer(
        db, actor=current_user, customer_id=customer_id, payload=payload
    )
    return CustomerResponse.model_validate(customer)


@router.get("/{customer_id}/contacts", response_model=list[CustomerContactResponse])
async def list_contacts(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[CustomerContactResponse]:
    contacts = await customer_service.list_contacts(db, actor=current_user, customer_id=customer_id)
    return [CustomerContactResponse.model_validate(c) for c in contacts]


@router.post(
    "/{customer_id}/contacts",
    response_model=CustomerContactResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_contact(
    customer_id: uuid.UUID,
    payload: CustomerContactCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> CustomerContactResponse:
    contact = await customer_service.add_contact(
        db, actor=current_user, customer_id=customer_id, payload=payload
    )
    return CustomerContactResponse.model_validate(contact)


@router.patch("/{customer_id}/contacts/{contact_id}", response_model=CustomerContactResponse)
async def update_contact(
    customer_id: uuid.UUID,
    contact_id: uuid.UUID,
    payload: CustomerContactUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> CustomerContactResponse:
    contact = await customer_service.update_contact(
        db,
        actor=current_user,
        customer_id=customer_id,
        contact_id=contact_id,
        payload=payload,
    )
    return CustomerContactResponse.model_validate(contact)
