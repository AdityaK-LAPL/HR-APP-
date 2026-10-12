"""End-to-end authentication flow tests over real HTTP, via the ASGI test
client. See docs/api-contract.md section 1.

Requires a real database with migrations applied - see tests/conftest.py.
Runs against the real Supabase database (the whole suite passes - see docs/development-status.md). Written to skip cleanly rather than fail
obscurely when DATABASE_URL is unreachable.
"""

from tests.conftest import make_user, requires_db

pytestmark = requires_db


def _csrf_headers(client) -> dict:
    token = client.cookies.get("csrf_token")
    return {"X-CSRF-Token": token} if token else {}


async def test_login_success_sets_cookies(client, db_session):
    await make_user(
        db_session, employee_code="EMP001", name="Alice", role="employee", password="Password123!"
    )

    response = await client.post(
        "/api/v1/auth/login", json={"employee_code": "EMP001", "password": "Password123!"}
    )
    assert response.status_code == 200
    assert response.json()["employee_code"] == "EMP001"
    assert client.cookies.get("access_token")
    assert client.cookies.get("refresh_token")
    assert client.cookies.get("csrf_token")


async def test_login_wrong_password_generic_error(client, db_session):
    await make_user(
        db_session, employee_code="EMP002", name="Bob", role="employee", password="Password123!"
    )

    response = await client.post(
        "/api/v1/auth/login", json={"employee_code": "EMP002", "password": "wrong-password"}
    )
    assert response.status_code == 401
    assert "invalid" in response.json()["error"]["message"].lower()


async def test_login_unknown_employee_code_same_generic_error(client):
    response = await client.post(
        "/api/v1/auth/login", json={"employee_code": "NOBODY", "password": "whatever123"}
    )
    assert response.status_code == 401
    assert "invalid" in response.json()["error"]["message"].lower()


async def test_login_lockout_after_repeated_failures(client, db_session):
    await make_user(
        db_session, employee_code="EMP003", name="Carl", role="employee", password="Password123!"
    )

    for _ in range(5):
        response = await client.post(
            "/api/v1/auth/login", json={"employee_code": "EMP003", "password": "wrong"}
        )
        assert response.status_code == 401

    locked_response = await client.post(
        "/api/v1/auth/login", json={"employee_code": "EMP003", "password": "Password123!"}
    )
    assert locked_response.status_code == 401
    assert "locked" in locked_response.json()["error"]["message"].lower()


async def test_me_requires_authentication(client):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


async def test_me_returns_current_user_after_login(client, db_session):
    await make_user(
        db_session, employee_code="EMP004", name="Dana", role="manager", password="Password123!"
    )
    await client.post(
        "/api/v1/auth/login", json={"employee_code": "EMP004", "password": "Password123!"}
    )

    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["employee_code"] == "EMP004"


async def test_mutating_request_without_csrf_header_is_rejected(client, db_session):
    await make_user(
        db_session, employee_code="EMP005", name="Eve", role="employee", password="Password123!"
    )
    await client.post(
        "/api/v1/auth/login", json={"employee_code": "EMP005", "password": "Password123!"}
    )

    response = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "Password123!", "new_password": "NewPassword456!"},
    )
    assert response.status_code == 403


async def test_change_password_revokes_existing_sessions(client, db_session):
    await make_user(
        db_session, employee_code="EMP006", name="Frank", role="employee", password="Password123!"
    )
    await client.post(
        "/api/v1/auth/login", json={"employee_code": "EMP006", "password": "Password123!"}
    )

    response = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "Password123!", "new_password": "NewPassword456!"},
        headers=_csrf_headers(client),
    )
    assert response.status_code == 204

    refresh_response = await client.post("/api/v1/auth/refresh")
    assert refresh_response.status_code == 401


async def test_logout_revokes_session(client, db_session):
    await make_user(
        db_session, employee_code="EMP007", name="Grace", role="employee", password="Password123!"
    )
    await client.post(
        "/api/v1/auth/login", json={"employee_code": "EMP007", "password": "Password123!"}
    )

    response = await client.post("/api/v1/auth/logout", headers=_csrf_headers(client))
    assert response.status_code == 204

    refresh_response = await client.post("/api/v1/auth/refresh")
    assert refresh_response.status_code == 401


async def test_refresh_rotates_refresh_token(client, db_session):
    await make_user(
        db_session, employee_code="EMP008", name="Hank", role="employee", password="Password123!"
    )
    await client.post(
        "/api/v1/auth/login", json={"employee_code": "EMP008", "password": "Password123!"}
    )
    old_refresh = client.cookies.get("refresh_token")

    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 200
    assert client.cookies.get("refresh_token") != old_refresh


async def test_owner_can_reset_any_users_password(client, db_session):
    await make_user(
        db_session, employee_code="OWN001", name="Owner", role="owner", password="OwnerPass123!"
    )
    employee = await make_user(
        db_session, employee_code="EMP009", name="Ivy", role="employee", password="Password123!"
    )

    await client.post(
        "/api/v1/auth/login", json={"employee_code": "OWN001", "password": "OwnerPass123!"}
    )
    response = await client.post(
        f"/api/v1/users/{employee.id}/reset-password",
        json={"temporary_password": "TempPass123!"},
        headers=_csrf_headers(client),
    )
    assert response.status_code == 204

    old_password_login = await client.post(
        "/api/v1/auth/login", json={"employee_code": "EMP009", "password": "Password123!"}
    )
    assert old_password_login.status_code == 401


async def test_manager_cannot_reset_password_outside_subtree(client, db_session):
    await make_user(
        db_session,
        employee_code="MGR001",
        name="Manager",
        role="manager",
        password="ManagerPass123!",
    )
    stranger = await make_user(
        db_session, employee_code="EMP010", name="Jill", role="employee", password="Password123!"
    )

    await client.post(
        "/api/v1/auth/login", json={"employee_code": "MGR001", "password": "ManagerPass123!"}
    )
    response = await client.post(
        f"/api/v1/users/{stranger.id}/reset-password",
        json={"temporary_password": "TempPass123!"},
        headers=_csrf_headers(client),
    )
    # RLS hides rows outside the caller's scope, so the API answers 404 (existence is not revealed).
    assert response.status_code == 404
