"""Out-of-band recovery for a locked-out or forgotten account (the Owner's, above all).

Anyone who knows an employee ID can lock that account for 15 minutes by failing five sign-ins, and
the Owner has no one above them to reset their password - so there has to be a way in that does
not depend on the application's own login. Run from `backend/` on a machine that holds the
production environment:

    python -m scripts.recover_account --employee-code OWN001                 # unlock only
    python -m scripts.recover_account --employee-code OWN001 --reset-password

`--reset-password` sets a new random temporary password (printed once), forces a change at the next
sign-in and ends every session of that person. Both actions are written to the audit trail.
"""

import argparse
import asyncio
import secrets
import sys
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal, engine, set_rls_context
from app.models.identity import Session as SessionModel
from app.models.identity import User, UserCredentials
from app.services.audit_service import record_audit_log


async def recover(employee_code: str, *, reset_password: bool) -> str | None | bool:
    """False if there is no such person; otherwise the new temporary password (or None)."""
    async with AsyncSessionLocal() as db:
        await set_rls_context(db, user_id=None, role="system")
        user = (
            await db.execute(select(User).where(User.employee_code == employee_code))
        ).scalar_one_or_none()
        credentials = None
        if user is not None:
            credentials = (
                await db.execute(select(UserCredentials).where(UserCredentials.user_id == user.id))
            ).scalar_one_or_none()
        if user is None or credentials is None:
            return False

        credentials.failed_attempts = 0
        credentials.locked_until = None
        temporary = None
        if reset_password:
            temporary = secrets.token_urlsafe(18)
            credentials.password_hash = hash_password(temporary)
            credentials.must_reset = True
            credentials.password_changed_at = datetime.now(UTC)
            live = (
                await db.execute(
                    select(SessionModel).where(
                        SessionModel.user_id == user.id, SessionModel.revoked_at.is_(None)
                    )
                )
            ).scalars()
            for session in live:
                session.revoked_at = datetime.now(UTC)
        await record_audit_log(
            db,
            actor_user_id=None,
            action="user.password_reset" if reset_password else "user.account_unlocked",
            entity_type="user",
            entity_id=user.id,
            new_value={"source": "recover_account script"},
        )
        await db.commit()
        return temporary


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--employee-code", required=True)
    parser.add_argument("--reset-password", action="store_true")
    args = parser.parse_args()
    try:
        result = await recover(args.employee_code, reset_password=args.reset_password)
    finally:
        await engine.dispose()
    if result is False:
        print(f"No account with employee code {args.employee_code!r}.")
        return 1
    print(f"Unlocked {args.employee_code!r}.")
    if result:
        print("The password must be changed at the next sign-in.")
        print(f"Temporary password (shown once): {result}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
