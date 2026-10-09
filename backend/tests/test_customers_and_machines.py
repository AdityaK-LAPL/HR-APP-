"""Customer and machine endpoint tests - see docs/api-contract.md sections
10-11 and the Open Question 2 resolution in docs/development-status.md.

Requires a real database with migrations applied - see tests/conftest.py.
NOT YET EXECUTED in this environment (no reachable Postgres) - see
docs/development-status.md.
"""

from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


async def test_manager_can_view_all_customers(client, db_session):
    owner = await make_user(db_session, employee_code="OWN600", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="MGR600", name="Manager A", role="manager", manager_id=owner.id
    )
    owner_headers = await login(client, employee_code="OWN600", password="InitialPass123!")
    create_response = await client.post(
        "/api/v1/customers",
        json={"customer_code": "CUST001", "name": "ABC Company"},
        headers=owner_headers,
    )
    assert create_response.status_code == 201

    manager_headers = await login(client, employee_code="MGR600", password="InitialPass123!")
    list_response = await client.get("/api/v1/customers", headers=manager_headers)
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1


async def test_employee_cannot_view_unassigned_customer(client, db_session):
    owner = await make_user(db_session, employee_code="OWN601", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="EMP600", name="Employee", role="employee", manager_id=owner.id
    )
    owner_headers = await login(client, employee_code="OWN601", password="InitialPass123!")
    create_response = await client.post(
        "/api/v1/customers",
        json={"customer_code": "CUST002", "name": "XYZ Corp"},
        headers=owner_headers,
    )
    customer_id = create_response.json()["id"]

    employee_headers = await login(client, employee_code="EMP600", password="InitialPass123!")
    response = await client.get(f"/api/v1/customers/{customer_id}", headers=employee_headers)
    # RLS hides rows outside the caller's scope, so the API answers 404 (existence is not revealed).
    assert response.status_code == 404


async def test_employee_can_view_customer_once_assigned_to_a_service_call(client, db_session):
    owner = await make_user(db_session, employee_code="OWN602", name="Owner", role="owner")
    employee = await make_user(
        db_session, employee_code="EMP601", name="Employee", role="employee", manager_id=owner.id
    )
    owner_headers = await login(client, employee_code="OWN602", password="InitialPass123!")

    customer_resp = await client.post(
        "/api/v1/customers",
        json={"customer_code": "CUST003", "name": "Acme Ltd"},
        headers=owner_headers,
    )
    customer_id = customer_resp.json()["id"]
    machine_resp = await client.post(
        "/api/v1/machines",
        json={"customer_id": customer_id, "machine_code": "MC001"},
        headers=owner_headers,
    )
    machine_id = machine_resp.json()["id"]
    call_resp = await client.post(
        "/api/v1/service-calls",
        json={
            "service_call_code": "SC001",
            "customer_id": customer_id,
            "machine_id": machine_id,
            "contacted_at": "2026-09-25T10:00:00Z",
            "contact_method": "phone",
            "issue_reported": "Machine not starting",
            "service_type": "field_visit",
        },
        headers=owner_headers,
    )
    call_id = call_resp.json()["id"]
    await client.post(
        f"/api/v1/service-calls/{call_id}/assign",
        json={"employee_id": str(employee.id)},
        headers=owner_headers,
    )

    employee_headers = await login(client, employee_code="EMP601", password="InitialPass123!")
    response = await client.get(f"/api/v1/customers/{customer_id}", headers=employee_headers)
    assert response.status_code == 200


async def test_only_creator_or_scoped_manager_can_edit_customer(client, db_session):
    owner = await make_user(db_session, employee_code="OWN603", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="MGR601", name="Manager A", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="MGR602", name="Manager B", role="manager", manager_id=owner.id
    )

    a_headers = await login(client, employee_code="MGR601", password="InitialPass123!")
    create_response = await client.post(
        "/api/v1/customers",
        json={"customer_code": "CUST004", "name": "Beta Inc"},
        headers=a_headers,
    )
    customer_id = create_response.json()["id"]

    b_headers = await login(client, employee_code="MGR602", password="InitialPass123!")
    edit_by_b = await client.patch(
        f"/api/v1/customers/{customer_id}", json={"name": "Hijacked"}, headers=b_headers
    )
    assert edit_by_b.status_code == 403

    # One client holds one cookie jar: logging in as B replaced A's session.
    a_headers = await login(client, employee_code="MGR601", password="InitialPass123!")
    edit_by_a = await client.patch(
        f"/api/v1/customers/{customer_id}", json={"name": "Beta Incorporated"}, headers=a_headers
    )
    assert edit_by_a.status_code == 200


async def test_only_owner_can_deactivate_customer(client, db_session):
    owner = await make_user(db_session, employee_code="OWN604", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="MGR603", name="Manager", role="manager", manager_id=owner.id
    )

    m_headers = await login(client, employee_code="MGR603", password="InitialPass123!")
    create_response = await client.post(
        "/api/v1/customers",
        json={"customer_code": "CUST005", "name": "Gamma LLC"},
        headers=m_headers,
    )
    customer_id = create_response.json()["id"]

    deactivate_by_manager = await client.patch(
        f"/api/v1/customers/{customer_id}", json={"is_active": False}, headers=m_headers
    )
    assert deactivate_by_manager.status_code == 403

    owner_headers = await login(client, employee_code="OWN604", password="InitialPass123!")
    deactivate_by_owner = await client.patch(
        f"/api/v1/customers/{customer_id}", json={"is_active": False}, headers=owner_headers
    )
    assert deactivate_by_owner.status_code == 200
    assert deactivate_by_owner.json()["is_active"] is False


async def test_machine_requires_valid_customer(client, db_session):
    await make_user(db_session, employee_code="OWN605", name="Owner", role="owner")
    headers = await login(client, employee_code="OWN605", password="InitialPass123!")

    import uuid

    response = await client.post(
        "/api/v1/machines",
        json={"customer_id": str(uuid.uuid4()), "machine_code": "MC999"},
        headers=headers,
    )
    assert response.status_code == 422


async def test_deactivating_machine_preserves_service_history(client, db_session):
    await make_user(db_session, employee_code="OWN606", name="Owner", role="owner")
    headers = await login(client, employee_code="OWN606", password="InitialPass123!")

    customer_resp = await client.post(
        "/api/v1/customers",
        json={"customer_code": "CUST006", "name": "Delta Co"},
        headers=headers,
    )
    customer_id = customer_resp.json()["id"]
    machine_resp = await client.post(
        "/api/v1/machines",
        json={"customer_id": customer_id, "machine_code": "MC002"},
        headers=headers,
    )
    machine_id = machine_resp.json()["id"]
    call_resp = await client.post(
        "/api/v1/service-calls",
        json={
            "service_call_code": "SC002",
            "customer_id": customer_id,
            "machine_id": machine_id,
            "contacted_at": "2026-09-25T10:00:00Z",
            "contact_method": "phone",
            "issue_reported": "Leak detected",
            "service_type": "field_visit",
        },
        headers=headers,
    )
    assert call_resp.status_code == 201

    deactivate_resp = await client.patch(
        f"/api/v1/machines/{machine_id}", json={"is_active": False}, headers=headers
    )
    assert deactivate_resp.status_code == 200

    history_resp = await client.get(
        "/api/v1/service-calls", params={"machine_id": machine_id}, headers=headers
    )
    assert history_resp.status_code == 200
    assert history_resp.json()["total"] == 1
