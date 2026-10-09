"""Forced password change, "my permissions", and literal wildcard search.

Requires a real database with migrations applied - see tests/conftest.py.
"""

from datetime import UTC, datetime

from app.db.session import set_rls_context
from app.models.permission import PermissionGrant
from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


def _csrf(client) -> dict:
    return {"X-CSRF-Token": client.cookies.get("csrf_token", "")}


# -- must_reset: exposed and enforced -----------------------------------------------------


async def test_temporary_password_is_exposed_and_blocks_everything_but_change_password(
    client, db_session
):
    await make_user(db_session, employee_code="GAP-OWN", name="Owner", role="owner")
    headers = await login(client, employee_code="GAP-OWN", password="InitialPass123!")
    created = await client.post(
        "/api/v1/users",
        json={
            "employee_code": "GAP-NEW",
            "name": "New Hire",
            "role": "employee",
            "initial_password": "TempPassw0rd!",
        },
        headers=headers,
    )
    assert created.status_code == 201
    await client.post("/api/v1/auth/logout", headers=_csrf(client))

    login_response = await client.post(
        "/api/v1/auth/login", json={"employee_code": "GAP-NEW", "password": "TempPassw0rd!"}
    )
    assert login_response.status_code == 200
    assert login_response.json()["must_reset"] is True

    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200 and me.json()["must_reset"] is True

    blocked = await client.get("/api/v1/tasks")
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "password_change_required"
    blocked_write = await client.post("/api/v1/attendance/punch-in", json={}, headers=_csrf(client))
    assert blocked_write.status_code == 403
    assert blocked_write.json()["error"]["code"] == "password_change_required"

    changed = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "TempPassw0rd!", "new_password": "BrandNewPassw0rd!"},
        headers=_csrf(client),
    )
    assert changed.status_code == 204

    again = await client.post(
        "/api/v1/auth/login", json={"employee_code": "GAP-NEW", "password": "BrandNewPassw0rd!"}
    )
    assert again.json()["must_reset"] is False
    assert (await client.get("/api/v1/tasks")).status_code == 200


async def test_normal_accounts_report_must_reset_false(client, db_session):
    await make_user(db_session, employee_code="GAP-EMP", name="Emp", role="employee")
    response = await client.post(
        "/api/v1/auth/login", json={"employee_code": "GAP-EMP", "password": "InitialPass123!"}
    )
    assert response.json()["must_reset"] is False
    assert (await client.get("/api/v1/tasks")).status_code == 200


# -- GET /permissions/me ------------------------------------------------------------------


async def test_my_permissions_for_a_manager_lists_defaults_and_active_grants(client, db_session):
    owner = await make_user(db_session, employee_code="PM-OWN", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="PM-MGR", name="Mgr", role="manager", manager_id=owner.id
    )
    peer = await make_user(
        db_session, employee_code="PM-PEER", name="Peer", role="manager", manager_id=owner.id
    )
    await set_rls_context(db_session, user_id=None, role="system")
    db_session.add_all(
        [
            PermissionGrant(
                grantee_user_id=manager.id,
                permission_key="view_manager_team",
                scope_type="user",
                scope_id=peer.id,
                effect="allow",
                granted_by=owner.id,
            ),
            PermissionGrant(  # revoked: must not be listed
                grantee_user_id=manager.id,
                permission_key="view_manager_reports",
                scope_type="user",
                scope_id=peer.id,
                effect="allow",
                granted_by=owner.id,
                revoked_at=datetime.now(UTC),
            ),
            PermissionGrant(  # someone else's: must not be listed
                grantee_user_id=peer.id,
                permission_key="view_manager_team",
                scope_type="user",
                scope_id=manager.id,
                effect="allow",
                granted_by=owner.id,
            ),
        ]
    )
    await db_session.commit()

    await login(client, employee_code="PM-MGR", password="InitialPass123!")
    response = await client.get("/api/v1/permissions/me")
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "manager" and body["unrestricted"] is False
    defaults = {d["permission_key"]: d["allow"] for d in body["role_defaults"]}
    assert defaults["create_project"] is True and defaults["modify_project"] is False
    assert [(g["permission_key"], g["scope_id"], g["effect"]) for g in body["grants"]] == [
        ("view_manager_team", str(peer.id), "allow")
    ]


async def test_my_permissions_for_owner_and_employee(client, db_session):
    await make_user(db_session, employee_code="PM-OWN2", name="Owner", role="owner")
    await make_user(db_session, employee_code="PM-EMP2", name="Emp", role="employee")

    await login(client, employee_code="PM-EMP2", password="InitialPass123!")
    emp = (await client.get("/api/v1/permissions/me")).json()
    assert emp["role"] == "employee" and emp["unrestricted"] is False and emp["grants"] == []
    await client.post("/api/v1/auth/logout", headers=_csrf(client))

    await login(client, employee_code="PM-OWN2", password="InitialPass123!")
    assert (await client.get("/api/v1/permissions/me")).json()["unrestricted"] is True


async def test_my_permissions_requires_a_session(client):
    assert (await client.get("/api/v1/permissions/me")).status_code == 401


# -- search treats % and _ literally ------------------------------------------------------


async def test_search_wildcards_match_literally(client, db_session):
    await make_user(db_session, employee_code="SRCH-OWN", name="Owner", role="owner")
    await make_user(db_session, employee_code="SRCH-1", name="100% Effort", role="employee")
    await make_user(db_session, employee_code="SRCH-2", name="Plain Name", role="employee")
    await make_user(db_session, employee_code="SRCH_3", name="Under_score", role="employee")
    await login(client, employee_code="SRCH-OWN", password="InitialPass123!")

    percent = (await client.get("/api/v1/users", params={"search": "%"})).json()
    assert [u["name"] for u in percent["items"]] == ["100% Effort"]
    underscore = (await client.get("/api/v1/users", params={"search": "_"})).json()
    assert [u["name"] for u in underscore["items"]] == ["Under_score"]
    plain = (await client.get("/api/v1/users", params={"search": "plain"})).json()
    assert [u["name"] for u in plain["items"]] == ["Plain Name"]
    backslash = (await client.get("/api/v1/users", params={"search": "\\"})).json()
    assert backslash["items"] == []
