"""Audit log read endpoint tests - see docs/api-contract.md section 16.

Requires a real database with migrations applied - see tests/conftest.py.
Runs against the real Supabase database (the whole suite passes - see docs/development-status.md).
"""

from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


async def test_owner_can_list_audit_logs(client, db_session):
    owner = await make_user(db_session, employee_code="OWN900", name="Owner", role="owner")
    headers = await login(client, employee_code="OWN900", password="InitialPass123!")

    create_resp = await client.post(
        "/api/v1/users",
        json={
            "employee_code": "EMP900",
            "name": "New Hire",
            "role": "employee",
            "manager_id": str(owner.id),
            "initial_password": "TempPass123!",
        },
        headers=headers,
    )
    assert create_resp.status_code == 201

    response = await client.get(
        "/api/v1/audit-logs", params={"action": "user.created"}, headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert any(entry["action"] == "user.created" for entry in body["items"])


async def test_manager_cannot_list_audit_logs(client, db_session):
    owner = await make_user(db_session, employee_code="OWN901", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="MGR900", name="Manager", role="manager", manager_id=owner.id
    )
    headers = await login(client, employee_code="MGR900", password="InitialPass123!")

    response = await client.get("/api/v1/audit-logs", headers=headers)
    assert response.status_code == 403
