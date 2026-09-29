"""Project endpoint tests - see docs/api-contract.md section 5.

Requires a real database with migrations applied - see tests/conftest.py.
NOT YET EXECUTED in this environment (no reachable Postgres) - see
docs/development-status.md.
"""

from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


async def test_manager_can_create_project_by_default(client, db_session):
    owner = await make_user(db_session, employee_code="OWN300", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="MGR300", name="Manager", role="manager", manager_id=owner.id
    )
    headers = await login(client, employee_code="MGR300", password="InitialPass123!")

    response = await client.post(
        "/api/v1/projects", json={"name": "New Install Project"}, headers=headers
    )
    assert response.status_code == 201
    assert response.json()["owning_manager_id"]


async def test_employee_cannot_create_project(client, db_session):
    owner = await make_user(db_session, employee_code="OWN301", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="EMP300", name="Employee", role="employee", manager_id=owner.id
    )
    headers = await login(client, employee_code="EMP300", password="InitialPass123!")

    response = await client.post("/api/v1/projects", json={"name": "Not allowed"}, headers=headers)
    assert response.status_code == 403


async def test_non_owning_manager_cannot_modify_project_without_grant(client, db_session):
    owner = await make_user(db_session, employee_code="OWN302", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="MGR301", name="Manager A", role="manager", manager_id=owner.id
    )
    await make_user(
        db_session, employee_code="MGR302", name="Manager B", role="manager", manager_id=owner.id
    )

    a_headers = await login(client, employee_code="MGR301", password="InitialPass123!")
    create_response = await client.post(
        "/api/v1/projects", json={"name": "Manager A's Project"}, headers=a_headers
    )
    project_id = create_response.json()["id"]

    b_headers = await login(client, employee_code="MGR302", password="InitialPass123!")
    response = await client.patch(
        f"/api/v1/projects/{project_id}", json={"name": "Hijacked"}, headers=b_headers
    )
    assert response.status_code == 403


async def test_owner_grant_unlocks_modify_project_for_non_owning_manager(client, db_session):
    owner = await make_user(db_session, employee_code="OWN303", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="MGR303", name="Manager A", role="manager", manager_id=owner.id
    )
    manager_b = await make_user(
        db_session, employee_code="MGR304", name="Manager B", role="manager", manager_id=owner.id
    )

    a_headers = await login(client, employee_code="MGR303", password="InitialPass123!")
    create_response = await client.post(
        "/api/v1/projects", json={"name": "Manager A's Project"}, headers=a_headers
    )
    project_id = create_response.json()["id"]

    owner_headers = await login(client, employee_code="OWN303", password="InitialPass123!")
    grant_response = await client.post(
        "/api/v1/permissions/grants",
        json={
            "grantee_user_id": str(manager_b.id),
            "permission_key": "modify_project",
            "scope_type": "project",
            "scope_id": project_id,
            "effect": "allow",
        },
        headers=owner_headers,
    )
    assert grant_response.status_code == 201

    b_headers = await login(client, employee_code="MGR304", password="InitialPass123!")
    response = await client.patch(
        f"/api/v1/projects/{project_id}", json={"name": "Now allowed"}, headers=b_headers
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Now allowed"


async def test_archiving_requires_delete_archive_project_even_for_owner(client, db_session):
    owner = await make_user(db_session, employee_code="OWN304", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR305", name="Manager", role="manager", manager_id=owner.id
    )

    m_headers = await login(client, employee_code="MGR305", password="InitialPass123!")
    create_response = await client.post(
        "/api/v1/projects", json={"name": "My Project"}, headers=m_headers
    )
    project_id = create_response.json()["id"]

    # The owning manager can edit ordinary fields...
    edit_response = await client.patch(
        f"/api/v1/projects/{project_id}", json={"status": "in_progress"}, headers=m_headers
    )
    assert edit_response.status_code == 200

    # ...but cannot archive it without the separately-controlled permission.
    archive_response = await client.patch(
        f"/api/v1/projects/{project_id}", json={"is_active": False}, headers=m_headers
    )
    assert archive_response.status_code == 403

    owner_headers = await login(client, employee_code="OWN304", password="InitialPass123!")
    grant_response = await client.post(
        "/api/v1/permissions/grants",
        json={
            "grantee_user_id": str(manager.id),
            "permission_key": "delete_archive_project",
            "scope_type": "project",
            "scope_id": project_id,
            "effect": "allow",
        },
        headers=owner_headers,
    )
    assert grant_response.status_code == 201

    # Logging in as the owner replaced this client's cookies, so the
    # manager's earlier CSRF header no longer matches - log back in.
    m_headers = await login(client, employee_code="MGR305", password="InitialPass123!")
    archive_again = await client.patch(
        f"/api/v1/projects/{project_id}", json={"is_active": False}, headers=m_headers
    )
    assert archive_again.status_code == 200, archive_again.text
    assert archive_again.json()["is_active"] is False


async def test_add_and_remove_project_member(client, db_session):
    owner = await make_user(db_session, employee_code="OWN305", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR306", name="Manager", role="manager", manager_id=owner.id
    )
    employee = await make_user(
        db_session,
        employee_code="EMP301",
        name="Employee",
        role="employee",
        manager_id=manager.id,
    )

    headers = await login(client, employee_code="MGR306", password="InitialPass123!")
    create_response = await client.post(
        "/api/v1/projects", json={"name": "Team Project"}, headers=headers
    )
    project_id = create_response.json()["id"]

    add_response = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": str(employee.id), "role_in_project": "Technician"},
        headers=headers,
    )
    assert add_response.status_code == 201

    list_response = await client.get(f"/api/v1/projects/{project_id}/members", headers=headers)
    assert len(list_response.json()) == 1

    remove_response = await client.delete(
        f"/api/v1/projects/{project_id}/members/{employee.id}", headers=headers
    )
    assert remove_response.status_code == 204

    list_after = await client.get(f"/api/v1/projects/{project_id}/members", headers=headers)
    assert len(list_after.json()) == 0


async def test_project_member_can_view_but_not_modify(client, db_session):
    owner = await make_user(db_session, employee_code="OWN306", name="Owner", role="owner")
    await make_user(
        db_session, employee_code="MGR307", name="Manager", role="manager", manager_id=owner.id
    )
    employee = await make_user(
        db_session, employee_code="EMP302", name="Employee", role="employee"
    )

    m_headers = await login(client, employee_code="MGR307", password="InitialPass123!")
    create_response = await client.post(
        "/api/v1/projects", json={"name": "Outside Team Member's Project"}, headers=m_headers
    )
    project_id = create_response.json()["id"]
    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": str(employee.id)},
        headers=m_headers,
    )

    e_headers = await login(client, employee_code="EMP302", password="InitialPass123!")
    view_response = await client.get(f"/api/v1/projects/{project_id}", headers=e_headers)
    assert view_response.status_code == 200

    modify_response = await client.patch(
        f"/api/v1/projects/{project_id}", json={"name": "Hijacked"}, headers=e_headers
    )
    assert modify_response.status_code == 403
