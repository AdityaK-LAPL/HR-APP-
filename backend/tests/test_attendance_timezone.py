"""Attendance days follow the company timezone (IST), not UTC.

Requires a real database with migrations applied - see tests/conftest.py.
"""

from datetime import UTC, datetime

from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


def _freeze(monkeypatch, *args):
    moment = datetime(*args, tzinfo=UTC)
    monkeypatch.setattr("app.services.attendance_service.utc_now", lambda: moment)


async def test_punch_just_after_utc_evening_belongs_to_the_next_ist_day(
    client, db_session, monkeypatch
):
    employee = await make_user(db_session, employee_code="TZ-EMP", name="E", role="employee")
    headers = await login(client, employee_code="TZ-EMP", password="InitialPass123!")

    _freeze(monkeypatch, 2026, 3, 1, 19, 0)  # 19:00 UTC on 1 Mar == 00:30 IST on 2 Mar
    punch = await client.post("/api/v1/attendance/punch-in", json={}, headers=headers)
    assert punch.status_code == 200
    assert punch.json()["work_date"] == "2026-03-02"

    on_ist_day = await client.get(f"/api/v1/attendance/{employee.id}/2026-03-02/events")
    on_utc_day = await client.get(f"/api/v1/attendance/{employee.id}/2026-03-01/events")
    assert [e["event_type"] for e in on_ist_day.json()] == ["punch_in"]
    assert on_utc_day.json() == []


async def test_a_full_day_in_ist_and_the_next_day_starts_at_ist_midnight(
    client, db_session, monkeypatch
):
    await make_user(db_session, employee_code="TZ-EMP2", name="E", role="employee")
    headers = await login(client, employee_code="TZ-EMP2", password="InitialPass123!")

    _freeze(monkeypatch, 2026, 3, 2, 3, 30)  # 09:00 IST, 2 Mar
    assert (
        await client.post("/api/v1/attendance/punch-in", json={}, headers=headers)
    ).status_code == 200
    _freeze(monkeypatch, 2026, 3, 2, 12, 0)  # 17:30 IST, 2 Mar
    out = await client.post("/api/v1/attendance/punch-out", json={}, headers=headers)
    assert out.status_code == 200
    assert out.json()["work_date"] == "2026-03-02"
    assert out.json()["total_duration_minutes"] == 510

    # Still 2 Mar in India at 23:59 IST (18:29 UTC): the cycle is complete, no second punch-in.
    _freeze(monkeypatch, 2026, 3, 2, 18, 29)
    again = await client.post("/api/v1/attendance/punch-in", json={}, headers=headers)
    assert again.status_code == 409

    # 00:10 IST on 3 Mar (18:40 UTC on 2 Mar) is a new company day.
    _freeze(monkeypatch, 2026, 3, 2, 18, 40)
    new_day = await client.post("/api/v1/attendance/punch-in", json={}, headers=headers)
    assert new_day.status_code == 200
    assert new_day.json()["work_date"] == "2026-03-03"
