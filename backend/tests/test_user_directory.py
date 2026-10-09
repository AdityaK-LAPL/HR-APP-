"""GET /users/directory: names for the ids in a caller's data, and nothing else.

Requires a real database with migrations applied - see tests/conftest.py.
"""

import uuid

from tests.conftest import login, make_user, requires_db

pytestmark = requires_db


async def _org(db):
    owner = await make_user(db, employee_code="DIR-OWN", name="Olivia Owner", role="owner")
    manager = await make_user(
        db, employee_code="DIR-MGR", name="Manny Manager", role="manager", manager_id=owner.id
    )
    stranger = await make_user(
        db, employee_code="DIR-STR", name="Sam Stranger", role="employee", manager_id=owner.id
    )
    employee = await make_user(
        db, employee_code="DIR-EMP", name="Erin Employee", role="employee", manager_id=manager.id
    )
    return owner, manager, stranger, employee


async def test_employee_can_resolve_names_they_cannot_otherwise_read(client, db_session):
    owner, manager, stranger, employee = await _org(db_session)
    await login(client, employee_code="DIR-EMP", password="InitialPass123!")

    # The profile endpoints still hide these people from the employee...
    assert (await client.get(f"/api/v1/users/{manager.id}")).status_code == 404
    assert (await client.get(f"/api/v1/users/{stranger.id}")).status_code == 404

    # ...but their display names resolve.
    response = await client.get(
        "/api/v1/users/directory", params=[("ids", str(manager.id)), ("ids", str(owner.id))]
    )
    assert response.status_code == 200
    by_id = {u["id"]: u for u in response.json()}
    assert by_id[str(manager.id)]["name"] == "Manny Manager"
    assert by_id[str(manager.id)]["employee_code"] == "DIR-MGR"
    assert by_id[str(manager.id)]["role"] == "manager"
    assert by_id[str(owner.id)]["name"] == "Olivia Owner"


async def test_directory_returns_only_display_fields(client, db_session):
    _, manager, _, _ = await _org(db_session)
    await login(client, employee_code="DIR-EMP", password="InitialPass123!")
    entry = (await client.get("/api/v1/users/directory", params={"ids": str(manager.id)})).json()[0]
    assert set(entry) == {"id", "name", "employee_code", "designation", "role", "is_active"}


async def test_unknown_and_duplicate_ids_are_handled(client, db_session):
    _, manager, _, _ = await _org(db_session)
    await login(client, employee_code="DIR-EMP", password="InitialPass123!")
    response = await client.get(
        "/api/v1/users/directory",
        params=[("ids", str(uuid.uuid4())), ("ids", str(manager.id)), ("ids", str(manager.id))],
    )
    assert response.status_code == 200
    assert [u["employee_code"] for u in response.json()] == ["DIR-MGR"]


async def test_deactivated_users_still_resolve_with_the_flag(client, db_session):
    owner, _, _, _ = await _org(db_session)
    gone = await make_user(
        db_session,
        employee_code="DIR-OLD",
        name="Old Hand",
        role="employee",
        manager_id=owner.id,
        is_active=False,
    )
    await login(client, employee_code="DIR-EMP", password="InitialPass123!")
    entry = (await client.get("/api/v1/users/directory", params={"ids": str(gone.id)})).json()[0]
    assert entry["name"] == "Old Hand" and entry["is_active"] is False


async def test_directory_validates_and_requires_a_session(client, db_session):
    assert (await client.get(f"/api/v1/users/directory?ids={uuid.uuid4()}")).status_code == 401

    await _org(db_session)
    await login(client, employee_code="DIR-EMP", password="InitialPass123!")
    assert (await client.get("/api/v1/users/directory")).status_code == 422
    assert (await client.get("/api/v1/users/directory?ids=not-a-uuid")).status_code == 422
    too_many = [("ids", str(uuid.uuid4())) for _ in range(101)]
    assert (await client.get("/api/v1/users/directory", params=too_many)).status_code == 422
    exactly_max = [("ids", str(uuid.uuid4())) for _ in range(100)]
    assert (await client.get("/api/v1/users/directory", params=exactly_max)).status_code == 200


async def test_directory_does_not_widen_the_profile_endpoints(client, db_session):
    _, manager, stranger, _ = await _org(db_session)
    await login(client, employee_code="DIR-EMP", password="InitialPass123!")
    await client.get("/api/v1/users/directory", params={"ids": str(stranger.id)})
    assert (await client.get(f"/api/v1/users/{stranger.id}")).status_code == 404
    listed = (await client.get("/api/v1/users")).json()["items"]
    assert [u["employee_code"] for u in listed] == ["DIR-EMP"]
