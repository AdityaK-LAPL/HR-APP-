"""Authentication business logic: login, refresh, logout, password changes.

Login and refresh need to look up a user/session *before* any session
exists, so they bootstrap the RLS context with the reserved 'system' role
(see docs/permissions.md section 6) rather than a real end-user role - that
value is never derived from client input, only ever set here by trusted
server-side code for exactly this purpose.
"""

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AuthenticationError, AuthorizationError, NotFoundError
from app.core.security import (
    create_access_token,
    generate_csrf_token,
    generate_refresh_token,
    hash_opaque_token,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.db.session import set_rls_context
from app.models.identity import Session as SessionModel
from app.models.identity import User, UserCredentials
from app.schemas.principal import CurrentUser
from app.services.audit_service import record_audit_log
from app.services.permission_service import in_scope

LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION_MINUTES = 15

# Computed once so a "no such employee_code" login still pays the same
# Argon2 cost as a real failed-password attempt, narrowing (not
# eliminating) the ability to enumerate valid employee codes by timing.
_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


class LoginResult:
    def __init__(self, *, user: User, access_token: str, refresh_token: str, csrf_token: str):
        self.user = user
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.csrf_token = csrf_token


def _issue_session(
    db: AsyncSession, *, user: User, user_agent: str | None, ip_address: str | None
) -> LoginResult:
    settings = get_settings()
    access_token = create_access_token(user_id=user.id, role=user.role)
    raw_refresh_token = generate_refresh_token()
    session = SessionModel(
        user_id=user.id,
        refresh_token_hash=hash_opaque_token(raw_refresh_token),
        user_agent=user_agent,
        ip_address=ip_address,
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(session)
    return LoginResult(
        user=user,
        access_token=access_token,
        refresh_token=raw_refresh_token,
        csrf_token=generate_csrf_token(),
    )


async def authenticate(
    db: AsyncSession,
    *,
    employee_code: str,
    password: str,
    user_agent: str | None,
    ip_address: str | None,
) -> LoginResult:
    await set_rls_context(db, user_id=None, role="system")

    generic_error = AuthenticationError("Invalid employee ID or password.")

    user = (
        await db.execute(select(User).where(User.employee_code == employee_code))
    ).scalar_one_or_none()

    if user is None or not user.is_active:
        verify_password(password, _DUMMY_PASSWORD_HASH)
        raise generic_error

    credentials = (
        await db.execute(select(UserCredentials).where(UserCredentials.user_id == user.id))
    ).scalar_one_or_none()
    if credentials is None:
        raise generic_error

    now = datetime.now(UTC)
    if credentials.locked_until and credentials.locked_until > now:
        raise AuthenticationError(
            "Account is temporarily locked due to repeated failed sign-in attempts."
        )

    if not verify_password(password, credentials.password_hash):
        credentials.failed_attempts += 1
        if credentials.failed_attempts >= LOCKOUT_THRESHOLD:
            credentials.locked_until = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            await record_audit_log(
                db,
                actor_user_id=None,
                action="user.account_locked",
                entity_type="user",
                entity_id=user.id,
                new_value={"locked_until": credentials.locked_until.isoformat()},
                ip_address=ip_address,
            )
        # Commit before raising: get_db rolls the transaction back on any
        # exception, which would otherwise discard this increment and make
        # the lockout threshold unreachable.
        await db.commit()
        raise generic_error

    credentials.failed_attempts = 0
    credentials.locked_until = None

    await set_rls_context(db, user_id=str(user.id), role=user.role)
    result = _issue_session(db, user=user, user_agent=user_agent, ip_address=ip_address)
    await db.flush()
    return result


async def refresh_session(
    db: AsyncSession,
    *,
    raw_refresh_token: str,
    user_agent: str | None,
    ip_address: str | None,
) -> LoginResult:
    await set_rls_context(db, user_id=None, role="system")

    generic_error = AuthenticationError("Session is invalid or has expired.")
    token_hash = hash_opaque_token(raw_refresh_token)
    session = (
        await db.execute(select(SessionModel).where(SessionModel.refresh_token_hash == token_hash))
    ).scalar_one_or_none()

    now = datetime.now(UTC)
    if session is None or session.revoked_at is not None or session.expires_at <= now:
        raise generic_error

    user = (await db.execute(select(User).where(User.id == session.user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise generic_error

    session.revoked_at = now
    await set_rls_context(db, user_id=str(user.id), role=user.role)
    result = _issue_session(db, user=user, user_agent=user_agent, ip_address=ip_address)
    await db.flush()
    return result


async def logout(
    db: AsyncSession, *, raw_refresh_token: str | None, current_user: CurrentUser
) -> None:
    if raw_refresh_token is None:
        return
    token_hash = hash_opaque_token(raw_refresh_token)
    session = (
        await db.execute(
            select(SessionModel).where(
                SessionModel.refresh_token_hash == token_hash,
                SessionModel.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if session is not None and session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)
        await db.flush()


async def change_password(
    db: AsyncSession, *, current_user: CurrentUser, current_password: str, new_password: str
) -> None:
    validate_password_strength(new_password)

    credentials = (
        await db.execute(select(UserCredentials).where(UserCredentials.user_id == current_user.id))
    ).scalar_one_or_none()
    if credentials is None or not verify_password(current_password, credentials.password_hash):
        raise AuthenticationError("Current password is incorrect.")

    now = datetime.now(UTC)
    credentials.password_hash = hash_password(new_password)
    credentials.must_reset = False
    credentials.password_changed_at = now
    credentials.failed_attempts = 0
    credentials.locked_until = None

    active_sessions = (
        await db.execute(
            select(SessionModel).where(
                SessionModel.user_id == current_user.id, SessionModel.revoked_at.is_(None)
            )
        )
    ).scalars()
    for session in active_sessions:
        session.revoked_at = now

    await record_audit_log(
        db,
        actor_user_id=current_user.id,
        action="user.password_changed",
        entity_type="user",
        entity_id=current_user.id,
    )
    await db.flush()


async def admin_reset_password(
    db: AsyncSession,
    *,
    actor: CurrentUser,
    target_user_id: uuid.UUID,
    temporary_password: str,
) -> None:
    validate_password_strength(temporary_password)

    target = (await db.execute(select(User).where(User.id == target_user_id))).scalar_one_or_none()
    if target is None:
        raise NotFoundError("User not found.")

    if actor.role != "owner":
        if actor.role != "manager" or not await in_scope(db, actor, target_user_id):
            raise AuthorizationError("You do not have permission to reset this user's password.")

    if actor.role == "owner" or actor.id == target_user_id:
        credentials = (
            await db.execute(select(UserCredentials).where(UserCredentials.user_id == target_user_id))
        ).scalar_one_or_none()
        if credentials is None:
            raise NotFoundError("User has no credentials on record.")

        now = datetime.now(UTC)
        credentials.password_hash = hash_password(temporary_password)
        credentials.must_reset = True
        credentials.password_changed_at = now
        credentials.failed_attempts = 0
        credentials.locked_until = None

        active_sessions = (
            await db.execute(
                select(SessionModel).where(
                    SessionModel.user_id == target_user_id, SessionModel.revoked_at.is_(None)
                )
            )
        ).scalars()
        for session in active_sessions:
            session.revoked_at = now
    else:
        # A Manager resetting a team member: row-level security keeps credentials and sessions
        # Owner-or-self (a manager must never read a password hash), so a narrow database
        # function does the write after re-checking the reporting line itself (migration 0018).
        reset = (
            await db.execute(
                text("SELECT app_admin_reset_password(:target, :hash)"),
                {"target": target_user_id, "hash": hash_password(temporary_password)},
            )
        ).scalar_one()
        if not reset:
            raise NotFoundError("User has no credentials on record.")

    await record_audit_log(
        db,
        actor_user_id=actor.id,
        action="user.password_reset",
        entity_type="user",
        entity_id=target_user_id,
    )
    await db.flush()
