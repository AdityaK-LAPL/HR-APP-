"""Task endpoint tests - see docs/api-contract.md section 4.

Requires a real database with migrations applied - see tests/conftest.py.
NOT YET EXECUTED in this environment (no reachable Postgres) - see
docs/development-status.md.
"""

from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


async def test_employee_cannot_create_task(client, db_session):
    owner = await make_user(db_session, employee_code="OWN200", name="Owner", role="owner")
    employee = await make_user(
        db_session, employee_code="EMP200", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="EMP200", password="InitialPass123!")

    response = await client.post(
        "/api/v1/tasks",
        json={"title": "Do a thing", "assigned_to": str(employee.id)},
        headers=headers,
    )
    assert response.status_code == 403


async def test_manager_can_assign_task_to_subordinate(client, db_session):
    owner = await make_user(db_session, employee_code="OWN201", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR200", name="Manager", role="manager", manager_id=owner.id
    )
    employee = await make_user(
        db_session,
        employee_code="EMP201",
        name="Employee",
        role="employee",
        manager_id=manager.id,
    )
    headers = await login(client, employee_code="MGR200", password="InitialPass123!")

    response = await client.post(
        "/api/v1/tasks",
        json={"title": "Install machine", "assigned_to": str(employee.id), "priority": "high"},
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["assigned_to"] == str(employee.id)
    assert body["assigned_by"]


async def test_manager_cannot_assign_task_outside_subtree_without_grant(client, db_session):
    owner = await make_user(db_session, employee_code="OWN202", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="MGR201", name="Manager A", role="manager", manager_id=owner.id
    )
    stranger = await make_user(
        db_session, employee_code="EMP202", name="Stranger", role="employee"
    )
    headers = await login(client, employee_code="MGR201", password="InitialPass123!")

    response = await client.post(
        "/api/v1/tasks",
        json={"title": "Do a thing", "assigned_to": str(stranger.id)},
        headers=headers,
    )
    assert response.status_code == 403


async def test_manager_can_assign_task_to_another_manager_with_grant(client, db_session):
    owner = await make_user(db_session, employee_code="OWN203", name="Owner", role="owner")
    manager_a = await make_user(
        db_session, employee_code="MGR202", name="Manager A", role="manager", manager_id=owner.id
    )
    manager_b = await make_user(
        db_session, employee_code="MGR203", name="Manager B", role="manager", manager_id=owner.id
    )

    owner_headers = await login(client, employee_code="OWN203", password="InitialPass123!")
    grant_response = await client.post(
        "/api/v1/permissions/grants",
        json={
            "grantee_user_id": str(manager_a.id),
            "permission_key": "assign_tasks_to_manager",
            "scope_type": "user",
            "scope_id": str(manager_b.id),
            "effect": "allow",
        },
        headers=owner_headers,
    )
    assert grant_response.status_code == 201

    manager_a_headers = await login(client, employee_code="MGR202", password="InitialPass123!")
    response = await client.post(
        "/api/v1/tasks",
        json={"title": "Cross-team task", "assigned_to": str(manager_b.id)},
        headers=manager_a_headers,
    )
    assert response.status_code == 201


async def test_employee_can_only_update_status_of_own_task(client, db_session):
    owner = await make_user(db_session, employee_code="OWN204", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR204", name="Manager", role="manager", manager_id=owner.id
    )
    employee = await make_user(
        db_session,
        employee_code="EMP203",
        name="Employee",
        role="employee",
        manager_id=manager.id,
    )

    manager_headers = await login(client, employee_code="MGR204", password="InitialPass123!")
    create_response = await client.post(
        "/api/v1/tasks",
        json={"title": "Fix printer", "assigned_to": str(employee.id)},
        headers=manager_headers,
    )
    task_id = create_response.json()["id"]

    employee_headers = await login(client, employee_code="EMP203", password="InitialPass123!")

    status_only = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "in_progress"},
        headers=employee_headers,
    )
    assert status_only.status_code == 200
    assert status_only.json()["status"] == "in_progress"

    title_change = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "A different task entirely"},
        headers=employee_headers,
    )
    assert title_change.status_code == 403


async def test_task_history_records_field_changes(client, db_session):
    owner = await make_user(db_session, employee_code="OWN205", name="Owner", role="owner")
    employee = await make_user(
        db_session, employee_code="EMP204", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="OWN205", password="InitialPass123!")

    create_response = await client.post(
        "/api/v1/tasks",
        json={"title": "Original title", "assigned_to": str(employee.id), "priority": "low"},
        headers=headers,
    )
    task_id = create_response.json()["id"]

    await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "Updated title", "priority": "high"},
        headers=headers,
    )

    history_response = await client.get(f"/api/v1/tasks/{task_id}/history", headers=headers)
    assert history_response.status_code == 200
    fields_changed = {entry["field_changed"] for entry in history_response.json()}
    assert fields_changed == {"title", "priority"}


async def test_employee_cannot_view_task_assigned_to_another_employee(client, db_session):
    owner = await make_user(db_session, employee_code="OWN206", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="EMP205", name="A", role="employee", manager_id=owner.id
    )
    employee_b = await make_user(
        db_session, employee_code="EMP206", name="B", role="employee", manager_id=owner.id
    )
    owner_headers = await login(client, employee_code="OWN206", password="InitialPass123!")

    create_response = await client.post(
        "/api/v1/tasks",
        json={"title": "B's task", "assigned_to": str(employee_b.id)},
        headers=owner_headers,
    )
    task_id = create_response.json()["id"]

    employee_a_headers = await login(client, employee_code="EMP205", password="InitialPass123!")
    response = await client.get(f"/api/v1/tasks/{task_id}", headers=employee_a_headers)
    assert response.status_code == 403
