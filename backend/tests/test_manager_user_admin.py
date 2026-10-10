"""A Manager editing a team member's profile and resetting their password (migration 0018).

The contract promised both; row-level security used to refuse them (profile edit -> HTTP 500,
reset -> 404). These tests pin the working behaviour *and* the limits: only the reporting
subtree, only name/designation, never a password hash, and sessions are revoked.

Requires a real database with migrations applied - see tests/conftest.py.
"""

import httpx
import pytest
from httpx import ASGITransport
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.db.session import set_rls_context
from app.main import app
from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


def _csrf(client) -> dict:
    return {"X-CSRF-Token": client.cookies.get("csrf_token", "")}


async def _company(db_session):
    owner = await make_user(db_session, employee_code="UA-OWN", name="Owner", role="owner")
    m1 = await make_user(
        db_session, employee_code="UA-M1", name="Mira", role="manager", manager_id=owner.id
    )
    m2 = await make_user(
        db_session, employee_code="UA-M2", name="Priya", role="manager", manager_id=owner.id
    )
    e1 = await make_user(
        db_session, employee_code="UA-E1", name="Ravi", role="employee", manager_id=m1.id
    )
    deep = await make_user(
        db_session, employee_code="UA-E2", name="Deep Report", role="employee", manager_id=m1.id
    )
    e3 = await make_user(
        db_session, employee_code="UA-E3", name="Zed", role="employee", manager_id=m2.id
    )
    return owner, m1, m2, e1, deep, e3


# -- profile edit -------------------------------------------------------------------------


async def test_manager_can_edit_name_and_designation_of_a_team_member(client, db_session):
    _, m1, _, e1, _, _ = await _company(db_session)
    headers = await login(client, employee_code="UA-M1", password="InitialPass123!")

    response = await client.patch(
        f"/api/v1/users/{e1.id}",
        json={"name": "Ravi Kumar", "designation": "Senior Engineer"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Ravi Kumar"
    assert response.json()["designation"] == "Senior Engineer"

    again = await client.get(f"/api/v1/users/{e1.id}")
    assert again.json()["designation"] == "Senior Engineer"


async def test_manager_cannot_edit_someone_outside_their_subtree(client, db_session):
    _, _, _, _, _, e3 = await _company(db_session)
    headers = await login(client, employee_code="UA-M1", password="InitialPass123!")

    response = await client.patch(f"/api/v1/users/{e3.id}", json={"name": "Hacked"}, headers=headers)
    assert response.status_code == 404  # RLS hides the row; existence is not revealed


async def test_manager_cannot_change_role_status_or_hierarchy_through_the_api(client, db_session):
    _, m1, _, e1, _, _ = await _company(db_session)
    headers = await login(client, employee_code="UA-M1", password="InitialPass123!")

    for body in ({"role": "manager"}, {"is_active": False}):
        response = await client.patch(f"/api/v1/users/{e1.id}", json=body, headers=headers)
        assert response.status_code == 403, (body, response.text)


async def test_employee_cannot_edit_a_colleague(client, db_session):
    _, _, _, e1, deep, _ = await _company(db_session)
    headers = await login(client, employee_code="UA-E1", password="InitialPass123!")

    response = await client.patch(f"/api/v1/users/{deep.id}", json={"name": "No"}, headers=headers)
    assert response.status_code in (403, 404)


async def test_database_itself_keeps_privileged_columns_owner_only(db_session):
    """Even if the service layer were bypassed, a manager's UPDATE cannot touch role/status."""
    _, m1, _, e1, _, _ = await _company(db_session)

    await set_rls_context(db_session, user_id=str(m1.id), role="manager")
    # name/designation are fine...
    await db_session.execute(
        text("UPDATE users SET designation = 'Lead' WHERE id = :id"), {"id": e1.id}
    )
    # ...role, status, reporting line and employee id are not.
    for column, value in (
        ("role", "'owner'"),
        ("is_active", "false"),
        ("employee_code", "'HACK'"),
        ("manager_id", "NULL"),
    ):
        with pytest.raises(DBAPIError, match="Only the Owner"):
            async with db_session.begin_nested():
                await db_session.execute(
                    text(f"UPDATE users SET {column} = {value} WHERE id = :id"), {"id": e1.id}
                )
    await db_session.rollback()


async def test_an_employee_cannot_promote_themself_even_directly_in_the_database(db_session):
    _, _, _, e1, _, _ = await _company(db_session)
    await set_rls_context(db_session, user_id=str(e1.id), role="employee")
    with pytest.raises(DBAPIError, match="Only the Owner"):
        await db_session.execute(text("UPDATE users SET role = 'owner' WHERE id = :id"), {"id": e1.id})
    await db_session.rollback()


# -- password reset -----------------------------------------------------------------------


async def test_manager_can_reset_a_team_members_password_and_their_sessions_end(client, db_session):
    _, m1, _, e1, _, _ = await _company(db_session)

    # The employee signs in (a live session) on a separate client.
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as employee_client:
        await login(employee_client, employee_code="UA-E1", password="InitialPass123!")
        assert (await employee_client.get("/api/v1/auth/me")).status_code == 200

        headers = await login(client, employee_code="UA-M1", password="InitialPass123!")
        response = await client.post(
            f"/api/v1/users/{e1.id}/reset-password",
            json={"temporary_password": "TempPass123!"},
            headers=headers,
        )
        assert response.status_code == 204, response.text

        # The old session cannot be refreshed, the old password no longer works...
        assert (
            await employee_client.post("/api/v1/auth/refresh", headers=_csrf(employee_client))
        ).status_code == 401
        old = await employee_client.post(
            "/api/v1/auth/login", json={"employee_code": "UA-E1", "password": "InitialPass123!"}
        )
        assert old.status_code == 401
        # ...and the temporary one works but forces a change.
        new = await employee_client.post(
            "/api/v1/auth/login", json={"employee_code": "UA-E1", "password": "TempPass123!"}
        )
        assert new.status_code == 200
        assert new.json()["must_reset"] is True


async def test_manager_reset_clears_a_lockout(client, db_session):
    _, m1, _, e1, _, _ = await _company(db_session)
    for _ in range(5):
        await client.post(
            "/api/v1/auth/login", json={"employee_code": "UA-E1", "password": "wrong-password"}
        )
    locked = await client.post(
        "/api/v1/auth/login", json={"employee_code": "UA-E1", "password": "InitialPass123!"}
    )
    assert locked.status_code in (401, 403, 429)

    headers = await login(client, employee_code="UA-M1", password="InitialPass123!")
    response = await client.post(
        f"/api/v1/users/{e1.id}/reset-password",
        json={"temporary_password": "TempPass123!"},
        headers=headers,
    )
    assert response.status_code == 204
    again = await client.post(
        "/api/v1/auth/login", json={"employee_code": "UA-E1", "password": "TempPass123!"}
    )
    assert again.status_code == 200


async def test_manager_cannot_reset_a_peer_managers_report(client, db_session):
    _, _, _, _, _, e3 = await _company(db_session)
    headers = await login(client, employee_code="UA-M1", password="InitialPass123!")
    response = await client.post(
        f"/api/v1/users/{e3.id}/reset-password",
        json={"temporary_password": "TempPass123!"},
        headers=headers,
    )
    assert response.status_code == 404


async def test_the_reset_function_refuses_anyone_but_the_owner_or_an_ancestor(db_session):
    owner, m1, m2, e1, _, _ = await _company(db_session)
    hash_ = "x" * 20

    for user_id, role, target in (
        (e1.id, "employee", e1.id),  # an employee cannot reset anyone, even themself, this way
        (m2.id, "manager", e1.id),  # a peer manager
        (m1.id, "manager", m1.id),  # nobody resets themself through the admin function
        (None, "system", e1.id),
    ):
        await set_rls_context(db_session, user_id=str(user_id) if user_id else None, role=role)
        with pytest.raises(DBAPIError, match="Not permitted"):
            async with db_session.begin_nested():
                await db_session.execute(
                    text("SELECT app_admin_reset_password(:t, :h)"), {"t": target, "h": hash_}
                )
    await db_session.rollback()


async def test_a_manager_still_cannot_read_password_hashes(db_session):
    _, m1, _, e1, _, _ = await _company(db_session)
    await set_rls_context(db_session, user_id=str(m1.id), role="manager")
    rows = (
        await db_session.execute(
            text("SELECT user_id FROM user_credentials WHERE user_id = :id"), {"id": e1.id}
        )
    ).all()
    assert rows == []
