"""Authentication/authorization dependencies.

`get_current_user` is the single entry point every protected route depends
on: it validates the access token, re-reads the user from the database
(never trusting the token's role claim beyond bootstrapping the initial
lookup), sets the PostgreSQL RLS context for the rest of the request's
transaction (see app/db/session.py: set_rls_context), and - for mutating
requests - verifies the CSRF double-submit token. Nothing downstream should
trust identity or role information from anywhere except this dependency's
return value.
"""

import uuid
from collections.abc import Callable, Coroutine

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cookies import ACCESS_TOKEN_COOKIE, CSRF_HEADER, CSRF_TOKEN_COOKIE
from app.core.errors import AuthenticationError, AuthorizationError
from app.core.security import decode_access_token
from app.db.session import get_db, set_rls_context
from app.models.identity import User
from app.schemas.principal import CurrentUser

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> CurrentUser:
    token = request.cookies.get(ACCESS_TOKEN_COOKIE)
    if not token:
        raise AuthenticationError("Not authenticated.")

    payload = decode_access_token(token)
    try:
        claimed_user_id = uuid.UUID(str(payload["sub"]))
    except (KeyError, ValueError) as exc:
        raise AuthenticationError("Invalid session.") from exc
    claimed_role = str(payload.get("role", ""))

    await set_rls_context(db, user_id=str(claimed_user_id), role=claimed_role)

    user = (
        await db.execute(select(User).where(User.id == claimed_user_id))
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise AuthenticationError("Session is no longer valid.")

    if user.role != claimed_role:
        # The Owner changed this user's role since the access token was
        # issued - trust the database, not the token, for every subsequent
        # authorization decision (including RLS) in this request.
        await set_rls_context(db, user_id=str(user.id), role=user.role)

    if request.method not in SAFE_METHODS:
        header_token = request.headers.get(CSRF_HEADER)
        cookie_token = request.cookies.get(CSRF_TOKEN_COOKIE)
        if not header_token or not cookie_token or header_token != cookie_token:
            raise AuthorizationError("Missing or invalid CSRF token.")

    return CurrentUser(id=user.id, employee_code=user.employee_code, name=user.name, role=user.role)


def require_role(*roles: str) -> Callable[..., Coroutine[None, None, CurrentUser]]:
    async def _dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in roles:
            raise AuthorizationError("You do not have permission to perform this action.")
        return current_user

    return _dependency


require_owner = require_role("owner")
require_manager_or_owner = require_role("manager", "owner")
