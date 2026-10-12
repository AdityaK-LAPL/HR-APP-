"""Service call, assignment, visit, and report tests - see
docs/api-contract.md sections 12-14 and docs/permissions.md section 8
("Service-call access works correctly").

Requires a real database with migrations applied - see tests/conftest.py.
Runs against the real Supabase database (the whole suite passes - see docs/development-status.md).
"""

from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


async def _setup_customer_and_machine(
    client, headers, customer_code="CUST100", machine_code="MC100"
):
    customer_resp = await client.post(
        "/api/v1/customers",
        json={"customer_code": customer_code, "name": "Test Co"},
        headers=headers,
    )
    customer_id = customer_resp.json()["id"]
    machine_resp = await client.post(
        "/api/v1/machines",
        json={"customer_id": customer_id, "machine_code": machine_code},
        headers=headers,
    )
    return customer_id, machine_resp.json()["id"]


async def test_employee_cannot_create_service_call(client, db_session):
    owner = await make_user(db_session, employee_code="OWN700", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="EMP700", name="Employee", role="employee", manager_id=owner.id
    )
    owner_headers = await login(client, employee_code="OWN700", password="InitialPass123!")
    customer_id, machine_id = await _setup_customer_and_machine(client, owner_headers)

    employee_headers = await login(client, employee_code="EMP700", password="InitialPass123!")
    response = await client.post(
        "/api/v1/service-calls",
        json={
            "service_call_code": "SC100",
            "customer_id": customer_id,
            "machine_id": machine_id,
            "contacted_at": "2026-09-25T10:00:00Z",
            "contact_method": "phone",
            "issue_reported": "Won't power on",
            "service_type": "field_visit",
        },
        headers=employee_headers,
    )
    assert response.status_code == 403


async def test_manager_creating_call_becomes_responsible_by_default(client, db_session):
    owner = await make_user(db_session, employee_code="OWN701", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR700", name="Manager", role="manager", manager_id=owner.id
    )
    m_headers = await login(client, employee_code="MGR700", password="InitialPass123!")
    customer_id, machine_id = await _setup_customer_and_machine(
        client, m_headers, "CUST101", "MC101"
    )

    response = await client.post(
        "/api/v1/service-calls",
        json={
            "service_call_code": "SC101",
            "customer_id": customer_id,
            "machine_id": machine_id,
            "contacted_at": "2026-09-25T10:00:00Z",
            "contact_method": "email",
            "issue_reported": "Overheating",
            "service_type": "online_support",
        },
        headers=m_headers,
    )
    assert response.status_code == 201
    assert response.json()["responsible_manager_id"] == str(manager.id)


async def test_unrelated_manager_cannot_view_service_call(client, db_session):
    owner = await make_user(db_session, employee_code="OWN702", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="MGR701", name="Manager A", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="MGR702", name="Manager B", role="manager", manager_id=owner.id
    )

    a_headers = await login(client, employee_code="MGR701", password="InitialPass123!")
    customer_id, machine_id = await _setup_customer_and_machine(
        client, a_headers, "CUST102", "MC102"
    )
    call_resp = await client.post(
        "/api/v1/service-calls",
        json={
            "service_call_code": "SC102",
            "customer_id": customer_id,
            "machine_id": machine_id,
            "contacted_at": "2026-09-25T10:00:00Z",
            "contact_method": "phone",
            "issue_reported": "Strange noise",
            "service_type": "field_visit",
        },
        headers=a_headers,
    )
    call_id = call_resp.json()["id"]

    b_headers = await login(client, employee_code="MGR702", password="InitialPass123!")
    response = await client.get(f"/api/v1/service-calls/{call_id}", headers=b_headers)
    # RLS hides rows outside the caller's scope, so the API answers 404 (existence is not revealed).
    assert response.status_code == 404


async def test_assign_and_unassign_employee_preserves_history(client, db_session):
    owner = await make_user(db_session, employee_code="OWN703", name="Owner", role="owner")
    employee = await make_user(
        db_session, employee_code="EMP701", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="OWN703", password="InitialPass123!")
    customer_id, machine_id = await _setup_customer_and_machine(client, headers, "CUST103", "MC103")
    call_resp = await client.post(
        "/api/v1/service-calls",
        json={
            "service_call_code": "SC103",
            "customer_id": customer_id,
            "machine_id": machine_id,
            "contacted_at": "2026-09-25T10:00:00Z",
            "contact_method": "phone",
            "issue_reported": "Belt slipping",
            "service_type": "field_visit",
        },
        headers=headers,
    )
    call_id = call_resp.json()["id"]

    assign_resp = await client.post(
        f"/api/v1/service-calls/{call_id}/assign",
        json={"employee_id": str(employee.id), "role_in_call": "primary"},
        headers=headers,
    )
    assert assign_resp.status_code == 201
    assignment_id = assign_resp.json()["id"]

    unassign_resp = await client.delete(
        f"/api/v1/service-calls/{call_id}/assign/{assignment_id}", headers=headers
    )
    assert unassign_resp.status_code == 204

    # the employee is no longer actively assigned...
    employee_headers = await login(client, employee_code="EMP701", password="InitialPass123!")
    view_resp = await client.get(f"/api/v1/service-calls/{call_id}", headers=employee_headers)
    # RLS hides rows outside the caller's scope, so the API answers 404 (existence is not revealed).
    assert view_resp.status_code == 404

    # ...but the assignment row (and who assigned/unassigned them) is preserved, not deleted.
    # (Logging in as the employee replaced this client's cookies - log back in.)
    headers = await login(client, employee_code="OWN703", password="InitialPass123!")
    reassign_list = await client.post(
        f"/api/v1/service-calls/{call_id}/assign",
        json={"employee_id": str(employee.id)},
        headers=headers,
    )
    assert reassign_list.status_code == 201
    assert reassign_list.json()["id"] != assignment_id

    active_assignments = await client.get(
        f"/api/v1/service-calls/{call_id}/assignments", headers=headers
    )
    assert active_assignments.status_code == 200
    assert len(active_assignments.json()) == 1

    all_assignments = await client.get(
        f"/api/v1/service-calls/{call_id}/assignments",
        params={"active_only": False},
        headers=headers,
    )
    assert len(all_assignments.json()) == 2


async def test_assigned_employee_can_only_update_status(client, db_session):
    owner = await make_user(db_session, employee_code="OWN704", name="Owner", role="owner")
    employee = await make_user(
        db_session, employee_code="EMP702", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="OWN704", password="InitialPass123!")
    customer_id, machine_id = await _setup_customer_and_machine(client, headers, "CUST104", "MC104")
    call_resp = await client.post(
        "/api/v1/service-calls",
        json={
            "service_call_code": "SC104",
            "customer_id": customer_id,
            "machine_id": machine_id,
            "contacted_at": "2026-09-25T10:00:00Z",
            "contact_method": "phone",
            "issue_reported": "No power",
            "service_type": "field_visit",
        },
        headers=headers,
    )
    call_id = call_resp.json()["id"]
    await client.post(
        f"/api/v1/service-calls/{call_id}/assign",
        json={"employee_id": str(employee.id)},
        headers=headers,
    )

    employee_headers = await login(client, employee_code="EMP702", password="InitialPass123!")
    status_only = await client.patch(
        f"/api/v1/service-calls/{call_id}", json={"status": "in_progress"}, headers=employee_headers
    )
    assert status_only.status_code == 200

    other_field = await client.patch(
        f"/api/v1/service-calls/{call_id}",
        json={"resolution": "Replaced fuse"},
        headers=employee_headers,
    )
    assert other_field.status_code == 403


async def test_visit_and_report_workflow(client, db_session):
    owner = await make_user(db_session, employee_code="OWN705", name="Owner", role="owner")
    employee = await make_user(
        db_session, employee_code="EMP703", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="OWN705", password="InitialPass123!")
    customer_id, machine_id = await _setup_customer_and_machine(client, headers, "CUST105", "MC105")
    call_resp = await client.post(
        "/api/v1/service-calls",
        json={
            "service_call_code": "SC105",
            "customer_id": customer_id,
            "machine_id": machine_id,
            "contacted_at": "2026-09-25T10:00:00Z",
            "contact_method": "phone",
            "issue_reported": "Calibration drift",
            "service_type": "field_visit",
        },
        headers=headers,
    )
    call_id = call_resp.json()["id"]
    await client.post(
        f"/api/v1/service-calls/{call_id}/assign",
        json={"employee_id": str(employee.id)},
        headers=headers,
    )

    employee_headers = await login(client, employee_code="EMP703", password="InitialPass123!")
    visit_resp = await client.post(
        f"/api/v1/service-calls/{call_id}/visits",
        json={"visit_type": "field_visit", "work_performed": "Recalibrated sensor"},
        headers=employee_headers,
    )
    assert visit_resp.status_code == 201
    visit_id = visit_resp.json()["id"]

    report_resp = await client.post(
        f"/api/v1/service-calls/{call_id}/report",
        json={
            "service_visit_id": visit_id,
            "work_performed": "Recalibrated sensor and tested",
            "result": "Resolved",
        },
        headers=employee_headers,
    )
    assert report_resp.status_code == 201
    report_id = report_resp.json()["id"]

    # One client holds one cookie jar: log back in as the owner to review.
    headers = await login(client, employee_code="OWN705", password="InitialPass123!")
    review_resp = await client.post(
        f"/api/v1/service-reports/{report_id}/review",
        json={"comments": "Looks good"},
        headers=headers,
    )
    assert review_resp.status_code == 200
    assert review_resp.json()["reviewed_by"] is not None


async def test_unassigned_employee_cannot_submit_report(client, db_session):
    owner = await make_user(db_session, employee_code="OWN706", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="EMP704", name="Bystander", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="OWN706", password="InitialPass123!")
    customer_id, machine_id = await _setup_customer_and_machine(client, headers, "CUST106", "MC106")
    call_resp = await client.post(
        "/api/v1/service-calls",
        json={
            "service_call_code": "SC106",
            "customer_id": customer_id,
            "machine_id": machine_id,
            "contacted_at": "2026-09-25T10:00:00Z",
            "contact_method": "phone",
            "issue_reported": "Unresponsive display",
            "service_type": "field_visit",
        },
        headers=headers,
    )
    call_id = call_resp.json()["id"]

    bystander_headers = await login(client, employee_code="EMP704", password="InitialPass123!")
    response = await client.post(
        f"/api/v1/service-calls/{call_id}/report",
        json={"work_performed": "Nothing, I wasn't assigned"},
        headers=bystander_headers,
    )
    # RLS hides rows outside the caller's scope, so the API answers 404 (existence is not revealed).
    assert response.status_code == 404


async def test_employee_sees_only_own_report_manager_sees_all(client, db_session):
    owner = await make_user(db_session, employee_code="OWN707", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR703", name="Manager", role="manager", manager_id=owner.id
    )
    employee_a = await make_user(
        db_session, employee_code="EMP705", name="A", role="employee", manager_id=manager.id
    )
    employee_b = await make_user(
        db_session, employee_code="EMP706", name="B", role="employee", manager_id=manager.id
    )

    m_headers = await login(client, employee_code="MGR703", password="InitialPass123!")
    customer_id, machine_id = await _setup_customer_and_machine(
        client, m_headers, "CUST107", "MC107"
    )
    call_resp = await client.post(
        "/api/v1/service-calls",
        json={
            "service_call_code": "SC107",
            "customer_id": customer_id,
            "machine_id": machine_id,
            "contacted_at": "2026-09-25T10:00:00Z",
            "contact_method": "phone",
            "issue_reported": "Joint call",
            "service_type": "field_visit",
        },
        headers=m_headers,
    )
    call_id = call_resp.json()["id"]
    await client.post(
        f"/api/v1/service-calls/{call_id}/assign",
        json={"employee_id": str(employee_a.id)},
        headers=m_headers,
    )
    await client.post(
        f"/api/v1/service-calls/{call_id}/assign",
        json={"employee_id": str(employee_b.id)},
        headers=m_headers,
    )

    a_headers = await login(client, employee_code="EMP705", password="InitialPass123!")
    await client.post(
        f"/api/v1/service-calls/{call_id}/report",
        json={"work_performed": "A's part of the work"},
        headers=a_headers,
    )
    b_headers = await login(client, employee_code="EMP706", password="InitialPass123!")
    await client.post(
        f"/api/v1/service-calls/{call_id}/report",
        json={"work_performed": "B's part of the work"},
        headers=b_headers,
    )

    # The client's cookie jar holds only the most recent login, so log in as
    # each viewer before reading as them.
    a_headers = await login(client, employee_code="EMP705", password="InitialPass123!")
    a_reports = await client.get(f"/api/v1/service-calls/{call_id}/reports", headers=a_headers)
    assert a_reports.status_code == 200
    assert len(a_reports.json()) == 1
    assert a_reports.json()[0]["employee_id"] == str(employee_a.id)

    m_headers = await login(client, employee_code="MGR703", password="InitialPass123!")
    manager_reports = await client.get(
        f"/api/v1/service-calls/{call_id}/reports", headers=m_headers
    )
    assert manager_reports.status_code == 200
    assert len(manager_reports.json()) == 2
