"""Team calendar endpoint - see docs/api-contract.md section 9."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas.calendar import CalendarResponse
from app.schemas.principal import CurrentUser
from app.services import calendar_service

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("", response_model=CalendarResponse)
async def get_calendar(
    start_date: date = Query(...),
    end_date: date = Query(...),
    user_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    team: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> CalendarResponse:
    entries = await calendar_service.get_calendar(
        db,
        actor=current_user,
        user_id=user_id,
        project_id=project_id,
        team=team,
        start_date=start_date,
        end_date=end_date,
    )
    return CalendarResponse(items=entries)
