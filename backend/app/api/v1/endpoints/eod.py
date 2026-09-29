"""EOD (End Of Day) report endpoints - see docs/api-contract.md section 7."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas.eod import EodCreateRequest, EodListResponse, EodResponse
from app.schemas.principal import CurrentUser
from app.services import eod_service

router = APIRouter(prefix="/eod", tags=["eod"])


@router.post("", response_model=EodResponse, status_code=status.HTTP_201_CREATED)
async def submit_eod(
    payload: EodCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> EodResponse:
    report = await eod_service.submit_eod(db, actor=current_user, payload=payload)
    return EodResponse.model_validate(report)


@router.get("", response_model=EodListResponse)
async def list_eod(
    user_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    report_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> EodListResponse:
    reports, total = await eod_service.list_eod(
        db,
        actor=current_user,
        user_id=user_id,
        project_id=project_id,
        report_date=report_date,
        page=page,
        page_size=page_size,
    )
    return EodListResponse(
        items=[EodResponse.model_validate(r) for r in reports],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{eod_id}", response_model=EodResponse)
async def get_eod(
    eod_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> EodResponse:
    report = await eod_service.get_eod(db, actor=current_user, eod_id=eod_id)
    return EodResponse.model_validate(report)
