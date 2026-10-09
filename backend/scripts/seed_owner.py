"""Create the first Owner account (idempotent).

The API can only create users when an Owner is already logged in, so the very
first Owner has to be created out-of-band. Run from `backend/`:

    python -m scripts.seed_owner                      # code OWN001, generated password
    python -m scripts.seed_owner --employee-code OWN001 --name "Jane Doe"
    OWNER_PASSWORD='...' python -m scripts.seed_owner

The password comes from --password, then $OWNER_PASSWORD, otherwise a random one
is generated and printed once. The account is created with `must_reset = true`,
like every user the API creates. Nothing is hardcoded and nothing is written to
disk; if the employee code already exists the script does nothing.

NOTE: the test suite truncates the business tables (tests/conftest.py), so re-run
this after running pytest against a shared development database.
"""

import argparse
import asyncio
import os
import secrets
import sys
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.security import hash_password, validate_password_strength
from app.db.session import AsyncSessionLocal, engine, set_rls_context
from app.models.identity import User, UserCredentials
from app.services.audit_service import record_audit_log


async def seed(employee_code: str, name: str, password: str) -> bool:
    async with AsyncSessionLocal() as db:
        await set_rls_context(db, user_id=None, role="system")
        existing = (
            await db.execute(select(User).where(User.employee_code == employee_code))
        ).scalar_one_or_none()
        if existing is not None:
            return False

        user = User(employee_code=employee_code, name=name, designation="Owner", role="owner")
        db.add(user)
        await db.flush()
        db.add(
            UserCredentials(
                user_id=user.id,
                password_hash=hash_password(password),
                must_reset=True,
                password_changed_at=datetime.now(UTC),
            )
        )
        await record_audit_log(
            db,
            actor_user_id=None,
            action="user.created",
            entity_type="user",
            entity_id=user.id,
            new_value={"employee_code": employee_code, "role": "owner", "source": "seed_owner"},
        )
        await db.commit()
        return True


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--employee-code", default="OWN001")
    parser.add_argument("--name", default="Company Owner")
    parser.add_argument("--password", default=os.environ.get("OWNER_PASSWORD"))
    args = parser.parse_args()

    generated = args.password is None
    password = args.password or secrets.token_urlsafe(18)
    validate_password_strength(password)

    try:
        created = await seed(args.employee_code, args.name, password)
    finally:
        await engine.dispose()

    if not created:
        print(f"Employee code {args.employee_code!r} already exists - nothing changed.")
        return 0
    print(f"Created Owner {args.employee_code!r} ({args.name}).")
    print("The password must be changed at first login.")
    if generated:
        print(f"Generated password (shown once): {password}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
