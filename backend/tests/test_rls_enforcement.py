"""Direct database tests proving PostgreSQL RLS constrains the application's own queries.

Before migration 0013 the app connected as Supabase's BYPASSRLS `postgres` role, so
every policy was skipped for application traffic. These tests go straight at the
database (no service layer) to prove the policies themselves now decide what each
identity can see or change, and that Supabase's public API roles are locked out.

Requires a real database with migrations applied - see tests/conftest.py.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.db.session import set_rls_context
from tests.conftest import make_user, requires_db

pytestmark = requires_db


async def _count(db, table: str) -> int:
    return (await db.execute(text(f"SELECT count(*) FROM {table}"))).scalar_one()


async def test_application_connection_does_not_bypass_rls(db_session):
    await set_rls_context(db_session, user_id=None, role="system")
    row = (
        await db_session.execute(
            text(
                "SELECT current_user, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user"
            )
        )
    ).one()
    assert row[0] == "hr_app_rls"
    assert row[1] is False


async def test_employee_sees_only_self_and_nothing_of_a_peer(db_session):
    a = await make_user(db_session, employee_code="RLS001", name="A", role="employee")
    b = await make_user(db_session, employee_code="RLS002", name="B", role="employee")

    await set_rls_context(db_session, user_id=str(a.id), role="employee")
    visible = (await db_session.execute(text("SELECT id FROM users"))).scalars().all()
    assert visible == [a.id]
    assert b.id not in visible


async def test_unknown_identity_sees_no_rows(db_session):
    await make_user(db_session, employee_code="RLS003", name="A", role="employee")

    await set_rls_context(
        db_session, user_id="00000000-0000-0000-0000-000000000001", role="employee"
    )
    assert await _count(db_session, "users") == 0
    assert await _count(db_session, "tasks") == 0


async def test_manager_sees_own_subtree_but_not_a_peer_manager_subtree(db_session):
    owner = await make_user(db_session, employee_code="RLS010", name="O", role="owner")
    m1 = await make_user(
        db_session, employee_code="RLS011", name="M1", role="manager", manager_id=owner.id
    )
    m2 = await make_user(
        db_session, employee_code="RLS012", name="M2", role="manager", manager_id=owner.id
    )
    e1 = await make_user(
        db_session, employee_code="RLS013", name="E1", role="employee", manager_id=m1.id
    )
    e2 = await make_user(
        db_session, employee_code="RLS014", name="E2", role="employee", manager_id=m2.id
    )

    await set_rls_context(db_session, user_id=str(m1.id), role="manager")
    visible = set((await db_session.execute(text("SELECT id FROM users"))).scalars().all())
    assert visible == {m1.id, e1.id}
    assert m2.id not in visible and e2.id not in visible

    await set_rls_context(db_session, user_id=str(owner.id), role="owner")
    assert await _count(db_session, "users") == 5


async def test_app_role_cannot_modify_or_delete_audit_logs(db_session):
    await set_rls_context(db_session, user_id=None, role="system")
    await db_session.execute(text("INSERT INTO audit_logs (action, entity_type) VALUES ('t', 't')"))
    for statement in ("UPDATE audit_logs SET action = 'x'", "DELETE FROM audit_logs"):
        with pytest.raises(DBAPIError):
            await db_session.execute(text(statement))
        await db_session.rollback()
        await set_rls_context(db_session, user_id=None, role="system")


async def test_non_owner_cannot_read_audit_logs(db_session):
    emp = await make_user(db_session, employee_code="RLS020", name="E", role="employee")
    await set_rls_context(db_session, user_id=None, role="system")
    await db_session.execute(text("INSERT INTO audit_logs (action, entity_type) VALUES ('t', 't')"))
    await db_session.commit()

    await set_rls_context(db_session, user_id=str(emp.id), role="employee")
    assert await _count(db_session, "audit_logs") == 0


async def test_app_role_cannot_touch_alembic_version(db_session):
    await set_rls_context(db_session, user_id=None, role="system")
    with pytest.raises(DBAPIError):
        await db_session.execute(text("SELECT * FROM alembic_version"))
    await db_session.rollback()


async def test_public_api_roles_have_no_access_at_all(db_session):
    await set_rls_context(db_session, user_id=None, role="system")
    grants = (
        await db_session.execute(
            text(
                "SELECT count(*) FROM information_schema.role_table_grants "
                "WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')"
            )
        )
    ).scalar_one()
    assert grants == 0


async def test_user_stub_reveals_only_minimal_fields_and_only_in_a_request_context(db_session):
    target = await make_user(db_session, employee_code="RLS030", name="Secret Name", role="manager")

    await set_rls_context(db_session, user_id=None, role="")
    empty = (
        await db_session.execute(text("SELECT * FROM app_user_stub(:i)"), {"i": target.id})
    ).all()
    assert empty == []

    other = await make_user(db_session, employee_code="RLS031", name="E", role="employee")
    await set_rls_context(db_session, user_id=str(other.id), role="employee")
    row = (
        await db_session.execute(text("SELECT * FROM app_user_stub(:i)"), {"i": target.id})
    ).one()
    assert set(row._mapping.keys()) == {"id", "role", "is_active"}
    assert row.role == "manager" and row.is_active is True
