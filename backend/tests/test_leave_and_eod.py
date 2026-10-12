"""Leave approval-chain and EOD endpoint tests - see docs/api-contract.md
sections 6-7.

Requires a real database with migrations applied - see tests/conftest.py.
Runs against the real Supabase database (the whole suite passes - see docs/development-status.md).
"""

from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


async def test_leave_apply_sets_direct_manager_as_approver(client, db_session):
    owner = await make_user(db_session, employee_code="OWN400", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR400", name="Manager", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="EMP400", name="Employee", role="employee", manager_id=manager.id
    )
    headers = await login(client, employee_code="EMP400", password="InitialPass123!")

    response = await client.post(
        "/api/v1/leaves",
        json={"start_date": "2026-10-01", "end_date": "2026-10-03", "reason": "Family event"},
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["current_approver_id"] == str(manager.id)


async def test_manager_can_approve_direct_reports_leave(client, db_session):
    owner = await make_user(db_session, employee_code="OWN401", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR401", name="Manager", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="EMP401", name="Employee", role="employee", manager_id=manager.id
    )

    e_headers = await login(client, employee_code="EMP401", password="InitialPass123!")
    apply_response = await client.post(
        "/api/v1/leaves",
        json={"start_date": "2026-11-01", "end_date": "2026-11-02"},
        headers=e_headers,
    )
    leave_id = apply_response.json()["id"]

    m_headers = await login(client, employee_code="MGR401", password="InitialPass123!")
    approve_response = await client.post(
        f"/api/v1/leaves/{leave_id}/approve", json={"comments": "Enjoy"}, headers=m_headers
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "approved"


async def test_unrelated_manager_cannot_approve_leave(client, db_session):
    owner = await make_user(db_session, employee_code="OWN402", name="Owner", role="owner")
    manager_a = await make_user(
        db_session, employee_code="MGR402", name="Manager A", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="MGR403", name="Manager B", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session,
        employee_code="EMP402",
        name="Employee",
        role="employee",
        manager_id=manager_a.id,
    )

    e_headers = await login(client, employee_code="EMP402", password="InitialPass123!")
    apply_response = await client.post(
        "/api/v1/leaves",
        json={"start_date": "2026-11-05", "end_date": "2026-11-06"},
        headers=e_headers,
    )
    leave_id = apply_response.json()["id"]

    b_headers = await login(client, employee_code="MGR403", password="InitialPass123!")
    response = await client.post(
        f"/api/v1/leaves/{leave_id}/approve", json={}, headers=b_headers
    )
    # RLS hides rows outside the caller's scope, so the API answers 404 (existence is not revealed).
    assert response.status_code == 404


async def test_reject_requires_comments(client, db_session):
    owner = await make_user(db_session, employee_code="OWN403", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR404", name="Manager", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="EMP403", name="Employee", role="employee", manager_id=manager.id
    )

    e_headers = await login(client, employee_code="EMP403", password="InitialPass123!")
    apply_response = await client.post(
        "/api/v1/leaves",
        json={"start_date": "2026-12-01", "end_date": "2026-12-02"},
        headers=e_headers,
    )
    leave_id = apply_response.json()["id"]

    m_headers = await login(client, employee_code="MGR404", password="InitialPass123!")
    missing_comment = await client.post(
        f"/api/v1/leaves/{leave_id}/reject", json={"comments": ""}, headers=m_headers
    )
    assert missing_comment.status_code == 422

    with_comment = await client.post(
        f"/api/v1/leaves/{leave_id}/reject",
        json={"comments": "Short-staffed that week"},
        headers=m_headers,
    )
    assert with_comment.status_code == 200
    assert with_comment.json()["status"] == "rejected"


async def test_employee_can_cancel_own_pending_leave(client, db_session):
    owner = await make_user(db_session, employee_code="OWN404", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="EMP404", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="EMP404", password="InitialPass123!")

    apply_response = await client.post(
        "/api/v1/leaves",
        json={"start_date": "2026-12-10", "end_date": "2026-12-11"},
        headers=headers,
    )
    leave_id = apply_response.json()["id"]

    cancel_response = await client.post(f"/api/v1/leaves/{leave_id}/cancel", headers=headers)
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"


async def test_cannot_cancel_leave_after_it_has_been_decided(client, db_session):
    owner = await make_user(db_session, employee_code="OWN408", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR408", name="Manager", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="EMP408", name="Employee", role="employee", manager_id=manager.id
    )

    e_headers = await login(client, employee_code="EMP408", password="InitialPass123!")
    apply_response = await client.post(
        "/api/v1/leaves",
        json={"start_date": "2026-12-15", "end_date": "2026-12-16"},
        headers=e_headers,
    )
    leave_id = apply_response.json()["id"]

    m_headers = await login(client, employee_code="MGR408", password="InitialPass123!")
    await client.post(f"/api/v1/leaves/{leave_id}/approve", json={}, headers=m_headers)

    # One client holds one cookie jar: the manager's login replaced the
    # employee's session - log back in as the employee before cancelling.
    e_headers = await login(client, employee_code="EMP408", password="InitialPass123!")
    cancel_response = await client.post(f"/api/v1/leaves/{leave_id}/cancel", headers=e_headers)
    assert cancel_response.status_code == 422


async def test_owner_leave_is_auto_approved(client, db_session):
    await make_user(db_session, employee_code="OWN405", name="Owner", role="owner")
    headers = await login(client, employee_code="OWN405", password="InitialPass123!")

    response = await client.post(
        "/api/v1/leaves",
        json={"start_date": "2027-01-01", "end_date": "2027-01-02"},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["status"] == "approved"


async def test_eod_submit_and_manager_visibility(client, db_session):
    owner = await make_user(db_session, employee_code="OWN406", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR406", name="Manager", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="EMP405", name="Employee", role="employee", manager_id=manager.id
    )

    e_headers = await login(client, employee_code="EMP405", password="InitialPass123!")
    submit_response = await client.post(
        "/api/v1/eod",
        json={"report_date": "2026-09-24", "work_completed": "Installed unit at site A"},
        headers=e_headers,
    )
    assert submit_response.status_code == 201
    eod_id = submit_response.json()["id"]

    m_headers = await login(client, employee_code="MGR406", password="InitialPass123!")
    view_response = await client.get(f"/api/v1/eod/{eod_id}", headers=m_headers)
    assert view_response.status_code == 200


async def test_employee_cannot_view_another_employees_eod(client, db_session):
    owner = await make_user(db_session, employee_code="OWN407", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="EMP406", name="A", role="employee", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="EMP407", name="B", role="employee", manager_id=owner.id
    )

    a_headers = await login(client, employee_code="EMP406", password="InitialPass123!")
    submit_response = await client.post(
        "/api/v1/eod",
        json={"report_date": "2026-09-24", "work_completed": "Did things"},
        headers=a_headers,
    )
    eod_id = submit_response.json()["id"]

    b_headers = await login(client, employee_code="EMP407", password="InitialPass123!")
    response = await client.get(f"/api/v1/eod/{eod_id}", headers=b_headers)
    # RLS hides rows outside the caller's scope, so the API answers 404 (existence is not revealed).
    assert response.status_code == 404
