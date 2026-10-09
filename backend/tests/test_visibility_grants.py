"""The Owner-controlled manager-visibility permissions are enforced end to end.

`view_manager_team` (profiles / hierarchy), `view_manager_reports` (EOD reports, tasks,
attendance) and `view_subordinate_manager_calendar` were catalogued but unenforced until
migration 0016. These tests prove, both straight against PostgreSQL row-level security and
through the HTTP API, that:

  * a peer manager sees nothing of another manager's branch by default;
  * an explicit ALLOW grant scoped to manager B exposes B's whole branch for that kind only;
  * an explicit DENY carves a hole out of the manager's own hierarchy;
  * a revoked grant stops working; viewing never grants write access.

Requires a real database with migrations applied - see tests/conftest.py.
"""

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.db.session import set_rls_context
from app.models.attendance import AttendanceDay
from app.models.eod import EodReport
from app.models.permission import PermissionGrant
from app.models.task import Task
from tests.conftest import login, make_user, requires_db

pytestmark = requires_db

TODAY = date(2026, 3, 2)


async def _build_org(db):
    """owner -> managers A and B (peers); A -> EA; B -> EB and sub-manager BS -> EBS.
    Every employee has one task (assigned by the owner), an EOD report and an attendance day."""

    owner = await make_user(db, employee_code="VIS-OWN", name="Owner", role="owner")
    a = await make_user(db, employee_code="VIS-A", name="A", role="manager", manager_id=owner.id)
    b = await make_user(db, employee_code="VIS-B", name="B", role="manager", manager_id=owner.id)
    bs = await make_user(db, employee_code="VIS-BS", name="BS", role="manager", manager_id=b.id)
    ea = await make_user(db, employee_code="VIS-EA", name="EA", role="employee", manager_id=a.id)
    eb = await make_user(db, employee_code="VIS-EB", name="EB", role="employee", manager_id=b.id)
    ebs = await make_user(
        db, employee_code="VIS-EBS", name="EBS", role="employee", manager_id=bs.id
    )

    snap = {
        k: SimpleNamespace(id=u.id, role=u.role, employee_code=u.employee_code, name=u.name)
        for k, u in {
            "owner": owner,
            "A": a,
            "B": b,
            "BS": bs,
            "EA": ea,
            "EB": eb,
            "EBS": ebs,
        }.items()
    }
    await set_rls_context(db, user_id=None, role="system")
    tasks = {}
    for user in (ea, eb, ebs):
        task = Task(
            title=f"task of {user.name}", assigned_to=user.id, assigned_by=owner.id, task_date=TODAY
        )
        db.add(task)
        db.add(EodReport(user_id=user.id, report_date=TODAY, work_completed="done"))
        db.add(AttendanceDay(user_id=user.id, work_date=TODAY, punch_in_time=datetime.now(UTC)))
        tasks[user.name] = task
    await db.commit()
    snap["tasks"] = {name: SimpleNamespace(id=t.id, title=t.title) for name, t in tasks.items()}
    return snap


async def _grant(db, org, *, grantee, key, target, effect="allow", revoked=False):
    await set_rls_context(db, user_id=None, role="system")
    grant = PermissionGrant(
        grantee_user_id=grantee.id,
        permission_key=key,
        scope_type="user",
        scope_id=target.id,
        effect=effect,
        granted_by=org["owner"].id,
        revoked_at=datetime.now(UTC) if revoked else None,
    )
    db.add(grant)
    await db.commit()
    return grant.id


async def _set_grant(db, grant_id, **columns):
    """Change a grant with plain SQL (ORM objects are expired by the read helpers' rollback)."""
    await set_rls_context(db, user_id=None, role="system")
    assignments = ", ".join(f"{name} = :{name}" for name in columns)
    await db.execute(
        text(f"UPDATE permission_grants SET {assignments} WHERE id = :grant_id"),
        {**columns, "grant_id": grant_id},
    )
    await db.commit()


async def _visible(db, user, sql: str) -> set[str]:
    await set_rls_context(db, user_id=str(user.id), role=user.role)
    rows = (await db.execute(text(sql))).scalars().all()
    await db.rollback()
    return {str(r) for r in rows}


USERS = "SELECT employee_code FROM users"
TASKS = "SELECT title FROM tasks"
EODS = "SELECT u.employee_code FROM eod_reports e JOIN users u ON u.id = e.user_id"
# eod/attendance join users, which has its own policy - use direct counts by user_id instead
EOD_BY = "SELECT user_id FROM eod_reports"
ATT_BY = "SELECT user_id FROM attendance_days"


# -- row-level security, queried directly -------------------------------------------------


async def test_peer_manager_sees_nothing_of_another_branch_by_default(db_session):
    org = await _build_org(db_session)
    a = org["A"]
    assert await _visible(db_session, a, USERS) == {"VIS-A", "VIS-EA"}
    assert await _visible(db_session, a, TASKS) == {"task of EA"}
    assert await _visible(db_session, a, EOD_BY) == {str(org["EA"].id)}
    assert await _visible(db_session, a, ATT_BY) == {str(org["EA"].id)}


async def test_reports_allow_exposes_b_branch_reports_but_not_profiles(db_session):
    org = await _build_org(db_session)
    await _grant(db_session, org, grantee=org["A"], key="view_manager_reports", target=org["B"])

    a = org["A"]
    assert await _visible(db_session, a, TASKS) == {"task of EA", "task of EB", "task of EBS"}
    assert await _visible(db_session, a, EOD_BY) == {
        str(org["EA"].id),
        str(org["EB"].id),
        str(org["EBS"].id),
    }
    assert str(org["EB"].id) in await _visible(db_session, a, ATT_BY)
    # `reports` is not `team`: B's people are still not listed as users.
    assert await _visible(db_session, a, USERS) == {"VIS-A", "VIS-EA"}


async def test_team_allow_exposes_b_branch_profiles_but_not_reports(db_session):
    org = await _build_org(db_session)
    await _grant(db_session, org, grantee=org["A"], key="view_manager_team", target=org["B"])

    a = org["A"]
    assert await _visible(db_session, a, USERS) == {
        "VIS-A",
        "VIS-EA",
        "VIS-B",
        "VIS-EB",
        "VIS-BS",
        "VIS-EBS",
    }
    assert await _visible(db_session, a, TASKS) == {"task of EA"}
    closure = await _visible(
        db_session,
        a,
        f"SELECT descendant_id FROM manager_hierarchy_closure "
        f"WHERE ancestor_id = '{org['B'].id}'",
    )
    assert str(org["EBS"].id) in closure


async def test_deny_carves_a_hole_in_the_managers_own_hierarchy(db_session):
    org = await _build_org(db_session)
    await _grant(
        db_session,
        org,
        grantee=org["A"],
        key="view_manager_reports",
        target=org["EA"],
        effect="deny",
    )
    # A is EA's manager, but the Owner denied A the reports of EA specifically.
    # (Tasks A *assigned* stay visible; here the owner assigned them, so they disappear.)
    assert await _visible(db_session, org["A"], TASKS) == set()
    assert await _visible(db_session, org["A"], EOD_BY) == set()
    # Unrelated kinds are untouched.
    assert await _visible(db_session, org["A"], USERS) == {"VIS-A", "VIS-EA"}


async def test_deny_beats_allow(db_session):
    org = await _build_org(db_session)
    await _grant(db_session, org, grantee=org["A"], key="view_manager_reports", target=org["B"])
    await _grant(
        db_session,
        org,
        grantee=org["A"],
        key="view_manager_reports",
        target=org["BS"],
        effect="deny",
    )
    # B's branch except BS's sub-branch (BS and EBS).
    assert await _visible(db_session, org["A"], TASKS) == {"task of EA", "task of EB"}


async def test_revoked_and_expired_grants_do_nothing(db_session):
    org = await _build_org(db_session)
    await _grant(
        db_session,
        org,
        grantee=org["A"],
        key="view_manager_reports",
        target=org["B"],
        revoked=True,
    )
    expired = await _grant(
        db_session, org, grantee=org["A"], key="view_manager_team", target=org["B"]
    )
    await _set_grant(db_session, expired, expires_at=datetime.now(UTC) - timedelta(minutes=1))

    assert await _visible(db_session, org["A"], TASKS) == {"task of EA"}
    assert await _visible(db_session, org["A"], USERS) == {"VIS-A", "VIS-EA"}


async def test_grant_for_one_manager_does_not_help_another(db_session):
    org = await _build_org(db_session)
    await _grant(db_session, org, grantee=org["A"], key="view_manager_reports", target=org["B"])
    # B's own view of A's branch is unaffected by A's grant.
    assert await _visible(db_session, org["B"], TASKS) == {"task of EB", "task of EBS"}
    # An employee never gains anything from the hierarchy functions.
    assert await _visible(db_session, org["EA"], TASKS) == {"task of EA"}


async def test_viewing_a_peers_reports_never_allows_changing_them(db_session):
    org = await _build_org(db_session)
    await _grant(db_session, org, grantee=org["A"], key="view_manager_reports", target=org["B"])
    await set_rls_context(db_session, user_id=str(org["A"].id), role="manager")
    result = await db_session.execute(
        text("UPDATE tasks SET title = 'hijacked' WHERE title = 'task of EB'")
    )
    assert result.rowcount == 0
    await db_session.rollback()


# -- through the HTTP API (service layer + RLS together) ----------------------------------


async def _a_headers(client, pw="InitialPass123!"):
    return await login(client, employee_code="VIS-A", password=pw)


async def test_api_reports_grant_lifecycle(client, db_session):
    org = await _build_org(db_session)
    await _a_headers(client)
    eb_task = org["tasks"]["EB"]

    # No grant: the peer branch is invisible everywhere in the API.
    assert (await client.get(f"/api/v1/tasks/{eb_task.id}")).status_code == 404
    titles = {t["title"] for t in (await client.get("/api/v1/tasks")).json()["items"]}
    assert titles == {"task of EA"}
    eods = (await client.get("/api/v1/eod")).json()["items"]
    assert {e["user_id"] for e in eods} == {str(org["EA"].id)}
    att = (await client.get("/api/v1/attendance")).json()["items"]
    assert {d["user_id"] for d in att} == {str(org["EA"].id)}
    events = await client.get(f"/api/v1/attendance/{org['EB'].id}/{TODAY}/events")
    assert events.status_code in (403, 404)

    grant = await _grant(
        db_session, org, grantee=org["A"], key="view_manager_reports", target=org["B"]
    )
    assert (await client.get(f"/api/v1/tasks/{eb_task.id}")).status_code == 200
    titles = {t["title"] for t in (await client.get("/api/v1/tasks")).json()["items"]}
    assert titles == {"task of EA", "task of EB", "task of EBS"}
    eods = (await client.get("/api/v1/eod")).json()["items"]
    assert {e["user_id"] for e in eods} == {
        str(org["EA"].id),
        str(org["EB"].id),
        str(org["EBS"].id),
    }
    att = (await client.get("/api/v1/attendance")).json()["items"]
    assert str(org["EB"].id) in {d["user_id"] for d in att}
    assert (
        await client.get(f"/api/v1/attendance/{org['EB'].id}/{TODAY}/events")
    ).status_code == 200
    workload = {r["user_id"] for r in (await client.get("/api/v1/reports/workload")).json()}
    assert str(org["EB"].id) in workload
    # ...but not the profile (that is `view_manager_team`).
    assert (await client.get(f"/api/v1/users/{org['EB'].id}")).status_code == 404

    # Read access only.
    headers = {"X-CSRF-Token": client.cookies.get("csrf_token", "")}
    patch = await client.patch(
        f"/api/v1/tasks/{eb_task.id}", json={"status": "in_progress"}, headers=headers
    )
    assert patch.status_code in (403, 404)

    # Revoking the grant removes access again.
    await _set_grant(db_session, grant, revoked_at=datetime.now(UTC))
    assert (await client.get(f"/api/v1/tasks/{eb_task.id}")).status_code == 404


async def test_api_team_grant_shows_profiles_subordinates_and_hierarchy(client, db_session):
    org = await _build_org(db_session)
    await _a_headers(client)
    b = org["B"]
    assert (await client.get(f"/api/v1/users/{b.id}")).status_code == 404
    assert (await client.get(f"/api/v1/users/{b.id}/subordinates")).status_code == 403

    await _grant(db_session, org, grantee=org["A"], key="view_manager_team", target=b)
    assert (await client.get(f"/api/v1/users/{b.id}")).status_code == 200
    subs = (await client.get(f"/api/v1/users/{b.id}/subordinates")).json()
    assert {u["employee_code"] for u in subs} == {"VIS-EB", "VIS-BS", "VIS-EBS"}
    codes = {u["employee_code"] for u in (await client.get("/api/v1/users")).json()["items"]}
    assert {"VIS-B", "VIS-EB", "VIS-BS", "VIS-EBS"} <= codes
    tree = {n["employee_code"] for n in (await client.get("/api/v1/hierarchy")).json()}
    assert {"VIS-A", "VIS-EA", "VIS-B", "VIS-EBS"} <= tree


async def test_api_deny_hides_own_employee_from_reports_and_calendar(client, db_session):
    org = await _build_org(db_session)
    await _a_headers(client)
    params = f"?start_date={TODAY}&end_date={TODAY}"

    before = (await client.get("/api/v1/calendar" + params)).json()["items"]
    assert any(e["user_id"] == str(org["EA"].id) for e in before)

    await _grant(
        db_session,
        org,
        grantee=org["A"],
        key="view_subordinate_manager_calendar",
        target=org["EA"],
        effect="deny",
    )
    after = (await client.get("/api/v1/calendar" + params)).json()["items"]
    assert not any(e["user_id"] == str(org["EA"].id) for e in after)

    await _grant(
        db_session,
        org,
        grantee=org["A"],
        key="view_manager_reports",
        target=org["EA"],
        effect="deny",
    )
    assert (await client.get("/api/v1/tasks")).json()["items"] == []
    assert (await client.get(f"/api/v1/tasks/{org['tasks']['EA'].id}")).status_code == 404


async def test_owner_and_employees_are_unaffected(client, db_session):
    org = await _build_org(db_session)
    await login(client, employee_code="VIS-OWN", password="InitialPass123!")
    assert (await client.get("/api/v1/tasks")).json()["total"] == 3
    await client.post(
        "/api/v1/auth/logout", headers={"X-CSRF-Token": client.cookies.get("csrf_token", "")}
    )

    await login(client, employee_code="VIS-EA", password="InitialPass123!")
    titles = {t["title"] for t in (await client.get("/api/v1/tasks")).json()["items"]}
    assert titles == {"task of EA"}
    assert org  # silence unused warning in case of future edits


@pytest.mark.parametrize("kind", ["team", "reports", "calendar"])
async def test_visible_user_ids_includes_self_and_tolerates_unknown_context(db_session, kind):
    org = await _build_org(db_session)
    assert str(org["EA"].id) in await _visible(
        db_session, org["EA"], f"SELECT app_visible_user_ids('{kind}')"
    )
    # No identity at all -> empty set (never "everyone").
    await set_rls_context(db_session, user_id=None, role="")
    rows = (await db_session.execute(text(f"SELECT app_visible_user_ids('{kind}')"))).all()
    assert rows == []
