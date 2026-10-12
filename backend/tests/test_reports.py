"""Reporting endpoint tests - see docs/api-contract.md section 18.

Requires a real database with migrations applied - see tests/conftest.py.
Runs against the real Supabase database (the whole suite passes - see docs/development-status.md).
"""

from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


async def test_employee_cannot_access_reports(client, db_session):
    owner = await make_user(db_session, employee_code="OWN1100", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="EMP1100", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="EMP1100", password="InitialPass123!")

    response = await client.get("/api/v1/reports/tasks", headers=headers)
    assert response.status_code == 403


async def test_manager_task_report_scoped_to_subtree(client, db_session):
    owner = await make_user(db_session, employee_code="OWN1101", name="Owner", role="owner")
    manager_a = await make_user(
        db_session, employee_code="MGR1100", name="Manager A", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="MGR1101", name="Manager B", role="manager", manager_id=owner.id
    )
    employee_a = await make_user(
        db_session, employee_code="EMP1101", name="A", role="employee", manager_id=manager_a.id
    )

    owner_headers = await login(client, employee_code="OWN1101", password="InitialPass123!")
    await client.post(
        "/api/v1/tasks",
        json={"title": "Under A", "assigned_to": str(employee_a.id)},
        headers=owner_headers,
    )

    a_headers = await login(client, employee_code="MGR1100", password="InitialPass123!")
    a_report = await client.get("/api/v1/reports/tasks", headers=a_headers)
    assert a_report.status_code == 200
    assert a_report.json()["total"] == 1

    b_headers = await login(client, employee_code="MGR1101", password="InitialPass123!")
    b_report = await client.get("/api/v1/reports/tasks", headers=b_headers)
    assert b_report.status_code == 200
    assert b_report.json()["total"] == 0


async def test_owner_workload_report_reflects_open_tasks(client, db_session):
    owner = await make_user(db_session, employee_code="OWN1102", name="Owner", role="owner")
    employee = await make_user(
        db_session, employee_code="EMP1102", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="OWN1102", password="InitialPass123!")
    await client.post(
        "/api/v1/tasks",
        json={"title": "Open task", "assigned_to": str(employee.id)},
        headers=headers,
    )

    response = await client.get("/api/v1/reports/workload", headers=headers)
    assert response.status_code == 200
    rows = {row["user_id"]: row for row in response.json()}
    assert rows[str(employee.id)]["open_task_count"] == 1
