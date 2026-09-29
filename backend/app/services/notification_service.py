"""In-app notification business logic. See docs/api-contract.md section 17.

Only create/list/mark-read exists here - nothing in this phase triggers
notifications automatically from other services (e.g. "task assigned"
does not yet produce one). context.md section 28 explicitly says the
first version doesn't have to implement every notification channel; this
lays the schema + API groundwork so producers can be wired in later
without another migration.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthorizationError, NotFoundError
from app.models.notification import Notification
from app.schemas.principal import CurrentUser


async def list_notifications(
    db: AsyncSession, *, actor: CurrentUser, unread_only: bool
) -> tuple[list[Notification], int]:
    stmt = select(Notification).where(Notification.recipient_user_id == actor.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.order_by(Notification.created_at.desc())
    notifications = (await db.execute(stmt)).scalars().all()
    return list(notifications), total


async def mark_read(
    db: AsyncSession, *, actor: CurrentUser, notification_id: uuid.UUID
) -> Notification:
    notification = (
        await db.execute(select(Notification).where(Notification.id == notification_id))
    ).scalar_one_or_none()
    if notification is None:
        raise NotFoundError("Notification not found.")
    if notification.recipient_user_id != actor.id:
        raise AuthorizationError("You can only mark your own notifications as read.")

    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        await db.flush()
    return notification


async def mark_all_read(db: AsyncSession, *, actor: CurrentUser) -> int:
    stmt = select(Notification).where(
        Notification.recipient_user_id == actor.id, Notification.read_at.is_(None)
    )
    notifications = (await db.execute(stmt)).scalars().all()
    now = datetime.now(UTC)
    for notification in notifications:
        notification.read_at = now
    await db.flush()
    return len(notifications)
