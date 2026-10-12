"""Notification endpoint tests - see docs/api-contract.md section 17.

Nothing in the backend produces notifications automatically yet (see
app/services/notification_service.py docstring), so these tests insert
rows directly via the ORM to exercise list/mark-read/mark-all-read.

Requires a real database with migrations applied - see tests/conftest.py.
Runs against the real Supabase database (the whole suite passes - see docs/development-status.md).
"""

import uuid

from app.db.session import set_rls_context
from app.models.notification import Notification
from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


async def _make_notification(
    db_session, *, recipient_id: uuid.UUID, type_: str = "test"
) -> Notification:
    await set_rls_context(db_session, user_id=str(recipient_id), role="system")
    notification = Notification(
        recipient_user_id=recipient_id, type=type_, payload={"message": "hi"}
    )
    db_session.add(notification)
    await db_session.flush()
    await db_session.commit()
    return notification


async def test_user_sees_only_own_notifications(client, db_session):
    employee_a = await make_user(db_session, employee_code="EMP1000", name="A", role="employee")
    employee_b = await make_user(db_session, employee_code="EMP1001", name="B", role="employee")
    await _make_notification(db_session, recipient_id=employee_a.id)
    await _make_notification(db_session, recipient_id=employee_b.id)

    a_headers = await login(client, employee_code="EMP1000", password="InitialPass123!")
    response = await client.get("/api/v1/notifications", headers=a_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["recipient_user_id"] == str(employee_a.id)


async def test_mark_read_requires_being_the_recipient(client, db_session):
    employee_a = await make_user(db_session, employee_code="EMP1002", name="A", role="employee")
    await make_user(db_session, employee_code="EMP1003", name="B", role="employee")
    notification = await _make_notification(db_session, recipient_id=employee_a.id)

    b_headers = await login(client, employee_code="EMP1003", password="InitialPass123!")
    response = await client.post(
        f"/api/v1/notifications/{notification.id}/read", headers=b_headers
    )
    # RLS hides rows outside the caller's scope, so the API answers 404 (existence is not revealed).
    assert response.status_code == 404

    a_headers = await login(client, employee_code="EMP1002", password="InitialPass123!")
    response = await client.post(
        f"/api/v1/notifications/{notification.id}/read", headers=a_headers
    )
    assert response.status_code == 200
    assert response.json()["read_at"] is not None


async def test_mark_all_read(client, db_session):
    employee = await make_user(
        db_session, employee_code="EMP1004", name="Employee", role="employee"
    )
    await _make_notification(db_session, recipient_id=employee.id, type_="a")
    await _make_notification(db_session, recipient_id=employee.id, type_="b")

    headers = await login(client, employee_code="EMP1004", password="InitialPass123!")
    response = await client.post("/api/v1/notifications/read-all", headers=headers)
    assert response.status_code == 204

    list_resp = await client.get(
        "/api/v1/notifications", params={"unread_only": True}, headers=headers
    )
    assert list_resp.json()["total"] == 0
