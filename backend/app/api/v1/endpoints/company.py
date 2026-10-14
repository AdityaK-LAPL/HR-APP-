"""Company settings and holidays - see docs/api-contract.md section 18b."""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_owner
from app.db.session import get_db
from app.schemas.company import (
    CompanySettingsResponse,
    CompanySettingsUpdateRequest,
    HolidayCreateRequest,
    HolidayResponse,
)
from app.schemas.principal import CurrentUser
from app.services import company_service

router = APIRouter(prefix="/company", tags=["company"])


@router.get("/settings", response_model=CompanySettingsResponse)
async def get_company_settings(
    db: AsyncSession = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)
) -> CompanySettingsResponse:
    return CompanySettingsResponse.model_validate(await company_service.get_settings_row(db))


@router.patch("/settings", response_model=CompanySettingsResponse)
async def update_company_settings(
    payload: CompanySettingsUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_owner),
) -> CompanySettingsResponse:
    row = await company_service.update_settings(db, actor=current_user, payload=payload)
    return CompanySettingsResponse.model_validate(row)


@router.get("/holidays", response_model=list[HolidayResponse])
async def list_holidays(
    year: int | None = Query(None, ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[HolidayResponse]:
    rows = await company_service.list_holidays(db, year=year)
    return [HolidayResponse.model_validate(row) for row in rows]


@router.post("/holidays", response_model=HolidayResponse, status_code=status.HTTP_201_CREATED)
async def add_holiday(
    payload: HolidayCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_owner),
) -> HolidayResponse:
    row = await company_service.add_holiday(db, actor=current_user, payload=payload)
    return HolidayResponse.model_validate(row)


@router.delete("/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_holiday(
    holiday_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_owner),
) -> None:
    await company_service.remove_holiday(db, actor=current_user, holiday_id=holiday_id)
