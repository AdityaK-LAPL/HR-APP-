"""Minimal target-user lookup that works under RLS.

Several operations validate *another* user before permission checks run ("is the
assignee active?", "is the responsible manager a manager?"). `users_select` hides
users outside the caller's hierarchy, so a plain `select(User)` would report a
perfectly valid assignee as missing. `app_user_stub()` (migration 0014) is a
SECURITY DEFINER function that returns only id, role and is_active, and only
inside an authenticated request context - enough to validate, nothing more.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class UserStub:
    id: uuid.UUID
    role: str
    is_active: bool


async def get_user_stub(db: AsyncSession, user_id: uuid.UUID) -> UserStub | None:
    row = (
        await db.execute(
            text("SELECT id, role, is_active FROM app_user_stub(:user_id)"), {"user_id": user_id}
        )
    ).first()
    return None if row is None else UserStub(id=row.id, role=row.role, is_active=row.is_active)
