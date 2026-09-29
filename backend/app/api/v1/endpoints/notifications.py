"""Notification endpoints - see docs/api-contract.md section 17."""

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas.notification import NotificationListResponse, NotificationResponse
from app.schemas.principal import CurrentUser
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> NotificationListResponse:
    notifications, total = await notification_service.list_notifications(
        db, actor=current_user, unread_only=unread_only
    )
    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in notifications], total=total
    )


@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> NotificationResponse:
    notification = await notification_service.mark_read(
        db, actor=current_user, notification_id=notification_id
    )
    return NotificationResponse.model_validate(notification)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    await notification_service.mark_all_read(db, actor=current_user)
