"""Machine endpoints - see docs/api-contract.md section 11."""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas.machine import (
    MachineCreateRequest,
    MachineListResponse,
    MachineResponse,
    MachineUpdateRequest,
)
from app.schemas.principal import CurrentUser
from app.services import machine_service

router = APIRouter(prefix="/machines", tags=["machines"])


@router.get("", response_model=MachineListResponse)
async def list_machines(
    customer_id: uuid.UUID | None = None,
    serial_number: str | None = None,
    model_name: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> MachineListResponse:
    machines, total = await machine_service.list_machines(
        db,
        actor=current_user,
        customer_id=customer_id,
        serial_number=serial_number,
        model_name=model_name,
        page=page,
        page_size=page_size,
    )
    return MachineListResponse(
        items=[MachineResponse.model_validate(m) for m in machines],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=MachineResponse, status_code=status.HTTP_201_CREATED)
async def create_machine(
    payload: MachineCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> MachineResponse:
    machine = await machine_service.create_machine(db, actor=current_user, payload=payload)
    return MachineResponse.model_validate(machine)


@router.get("/{machine_id}", response_model=MachineResponse)
async def get_machine(
    machine_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> MachineResponse:
    machine = await machine_service.get_machine(db, actor=current_user, machine_id=machine_id)
    return MachineResponse.model_validate(machine)


@router.patch("/{machine_id}", response_model=MachineResponse)
async def update_machine(
    machine_id: uuid.UUID,
    payload: MachineUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> MachineResponse:
    machine = await machine_service.update_machine(
        db, actor=current_user, machine_id=machine_id, payload=payload
    )
    return MachineResponse.model_validate(machine)
