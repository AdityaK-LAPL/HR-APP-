"""Team calendar endpoint tests - see docs/api-contract.md section 9 and
context.md section 10.

Requires a real database with migrations applied - see tests/conftest.py.
NOT YET EXECUTED in this environment (no reachable Postgres) - see
docs/development-status.md.
"""

from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


async def test_calendar_includes_tasks_and_leave_for_own_scope(client, db_session):
    owner = await make_user(db_session, employee_code="OWN1200", name="Owner", role="owner")
    employee = await make_user(
        db_session, employee_code="EMP1200", name="Employee", role="employee", manager_id=owner.id
    )
    owner_headers = await login(client, employee_code="OWN1200", password="InitialPass123!")
    await client.post(
        "/api/v1/tasks",
        json={
            "title": "Install unit",
            "assigned_to": str(employee.id),
            "task_date": "2026-10-05",
        },
        headers=owner_headers,
    )

    employee_headers = await login(client, employee_code="EMP1200", password="InitialPass123!")
    await client.post(
        "/api/v1/leaves",
        json={"start_date": "2026-10-06", "end_date": "2026-10-07"},
        headers=employee_headers,
    )

    response = await client.get(
        "/api/v1/calendar",
        params={"start_date": "2026-10-01", "end_date": "2026-10-31"},
        headers=owner_headers,
    )
    assert response.status_code == 200
    items = response.json()["items"]
    entry_types = {item["entry_type"] for item in items}
    assert entry_types == {"task", "leave"}
    assert all(item["user_id"] == str(employee.id) for item in items)


async def test_manager_calendar_scoped_to_subtree(client, db_session):
    owner = await make_user(db_session, employee_code="OWN1201", name="Owner", role="owner")
    manager_a = await make_user(
        db_session, employee_code="MGR1200", name="Manager A", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="MGR1201", name="Manager B", role="manager", manager_id=owner.id
    )
    employee_a = await make_user(
        db_session, employee_code="EMP1201", name="A", role="employee", manager_id=manager_a.id
    )

    owner_headers = await login(client, employee_code="OWN1201", password="InitialPass123!")
    await client.post(
        "/api/v1/tasks",
        json={
            "title": "Under A",
            "assigned_to": str(employee_a.id),
            "task_date": "2026-11-01",
        },
        headers=owner_headers,
    )

    a_headers = await login(client, employee_code="MGR1200", password="InitialPass123!")
    a_response = await client.get(
        "/api/v1/calendar",
        params={"start_date": "2026-11-01", "end_date": "2026-11-30"},
        headers=a_headers,
    )
    assert len(a_response.json()["items"]) == 1

    b_headers = await login(client, employee_code="MGR1201", password="InitialPass123!")
    b_response = await client.get(
        "/api/v1/calendar",
        params={"start_date": "2026-11-01", "end_date": "2026-11-30"},
        headers=b_headers,
    )
    assert len(b_response.json()["items"]) == 0
