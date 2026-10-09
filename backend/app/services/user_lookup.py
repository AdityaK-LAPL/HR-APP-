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

from sqlalchemy import ARRAY, bindparam, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
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


async def get_directory(db: AsyncSession, user_ids: list[uuid.UUID]) -> list[dict]:
    """Display fields for the given ids (unknown ids are simply absent)."""
    statement = text(
        "SELECT id, name, employee_code, designation, role, is_active "
        "FROM app_user_directory(:ids)"
    ).bindparams(bindparam("ids", value=user_ids, type_=ARRAY(PG_UUID(as_uuid=True))))
    return [dict(row._mapping) for row in (await db.execute(statement)).all()]
