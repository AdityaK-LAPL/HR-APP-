"""Attendance endpoint tests - see docs/api-contract.md section 8.

Requires a real database with migrations applied - see tests/conftest.py.
NOT YET EXECUTED in this environment (no reachable Postgres) - see
docs/development-status.md.
"""

from datetime import date

from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


async def test_punch_in_creates_attendance_day(client, db_session):
    await make_user(db_session, employee_code="EMP500", name="Employee", role="employee")
    headers = await login(client, employee_code="EMP500", password="InitialPass123!")

    response = await client.post(
        "/api/v1/attendance/punch-in",
        json={"latitude": 12.9716, "longitude": 77.5946},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["work_date"] == date.today().isoformat()
    assert body["punch_in_time"] is not None
    assert body["punch_in_location"] == "12.9716,77.5946"
    assert body["status"] == "present"


async def test_punch_in_without_location_is_allowed(client, db_session):
    await make_user(db_session, employee_code="EMP501", name="Employee", role="employee")
    headers = await login(client, employee_code="EMP501", password="InitialPass123!")

    response = await client.post("/api/v1/attendance/punch-in", json={}, headers=headers)
    assert response.status_code == 200
    assert response.json()["punch_in_location"] is None


async def test_cannot_punch_in_twice(client, db_session):
    await make_user(db_session, employee_code="EMP502", name="Employee", role="employee")
    headers = await login(client, employee_code="EMP502", password="InitialPass123!")

    await client.post("/api/v1/attendance/punch-in", json={}, headers=headers)
    second = await client.post("/api/v1/attendance/punch-in", json={}, headers=headers)
    assert second.status_code == 409


async def test_cannot_punch_out_before_punching_in(client, db_session):
    await make_user(db_session, employee_code="EMP503", name="Employee", role="employee")
    headers = await login(client, employee_code="EMP503", password="InitialPass123!")

    response = await client.post("/api/v1/attendance/punch-out", json={}, headers=headers)
    assert response.status_code == 409


async def test_punch_out_computes_duration(client, db_session):
    await make_user(db_session, employee_code="EMP504", name="Employee", role="employee")
    headers = await login(client, employee_code="EMP504", password="InitialPass123!")

    await client.post("/api/v1/attendance/punch-in", json={}, headers=headers)
    response = await client.post(
        "/api/v1/attendance/punch-out",
        json={"latitude": 12.9, "longitude": 77.6},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["punch_out_time"] is not None
    assert body["total_duration_minutes"] is not None
    assert body["total_duration_minutes"] >= 0


async def test_cannot_punch_out_twice(client, db_session):
    await make_user(db_session, employee_code="EMP505", name="Employee", role="employee")
    headers = await login(client, employee_code="EMP505", password="InitialPass123!")

    await client.post("/api/v1/attendance/punch-in", json={}, headers=headers)
    await client.post("/api/v1/attendance/punch-out", json={}, headers=headers)
    second = await client.post("/api/v1/attendance/punch-out", json={}, headers=headers)
    assert second.status_code == 409


async def test_cannot_punch_in_again_after_completing_a_full_cycle(client, db_session):
    await make_user(db_session, employee_code="EMP506", name="Employee", role="employee")
    headers = await login(client, employee_code="EMP506", password="InitialPass123!")

    await client.post("/api/v1/attendance/punch-in", json={}, headers=headers)
    await client.post("/api/v1/attendance/punch-out", json={}, headers=headers)
    again = await client.post("/api/v1/attendance/punch-in", json={}, headers=headers)
    assert again.status_code == 409


async def test_manager_can_list_subtrees_attendance(client, db_session):
    owner = await make_user(db_session, employee_code="OWN500", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR500", name="Manager", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="EMP507", name="Employee", role="employee", manager_id=manager.id
    )

    e_headers = await login(client, employee_code="EMP507", password="InitialPass123!")
    await client.post("/api/v1/attendance/punch-in", json={}, headers=e_headers)

    m_headers = await login(client, employee_code="MGR500", password="InitialPass123!")
    response = await client.get("/api/v1/attendance", headers=m_headers)
    assert response.status_code == 200
    assert response.json()["total"] == 1


async def test_manager_cannot_list_outside_subtree_attendance(client, db_session):
    owner = await make_user(db_session, employee_code="OWN501", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="MGR501", name="Manager A", role="manager", manager_id=owner.id
    )
    stranger = await make_user(
        db_session, employee_code="EMP508", name="Stranger", role="employee"
    )

    s_headers = await login(client, employee_code="EMP508", password="InitialPass123!")
    await client.post("/api/v1/attendance/punch-in", json={}, headers=s_headers)

    m_headers = await login(client, employee_code="MGR501", password="InitialPass123!")
    response = await client.get(
        "/api/v1/attendance", params={"user_id": str(stranger.id)}, headers=m_headers
    )
    assert response.status_code == 200
    assert response.json()["total"] == 0


async def test_employee_cannot_view_another_employees_attendance_events(client, db_session):
    owner = await make_user(db_session, employee_code="OWN502", name="Owner", role="owner")
    employee_a = await make_user(
        db_session, employee_code="EMP509", name="A", role="employee", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="EMP510", name="B", role="employee", manager_id=owner.id
    )

    a_headers = await login(client, employee_code="EMP509", password="InitialPass123!")
    await client.post("/api/v1/attendance/punch-in", json={}, headers=a_headers)

    b_headers = await login(client, employee_code="EMP510", password="InitialPass123!")
    today = date.today().isoformat()
    response = await client.get(
        f"/api/v1/attendance/{employee_a.id}/{today}/events", headers=b_headers
    )
    assert response.status_code == 403
