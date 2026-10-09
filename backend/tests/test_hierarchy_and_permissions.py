"""Core business-rule tests: manager hierarchy, the permission evaluator,
and the access-boundary scenarios required by the project brief -
docs/permissions.md section 8.

Requires a real database with migrations applied - see tests/conftest.py.
NOT YET EXECUTED in this environment (no reachable Postgres) - see
docs/development-status.md.
"""

import uuid

from sqlalchemy import select

from app.db.session import set_rls_context
from app.models.identity import ManagerHierarchyClosure
from app.schemas.permission import PermissionGrantCreateRequest
from app.schemas.principal import CurrentUser
from app.services import hierarchy_service, permission_grant_service, user_service
from app.services.permission_service import has_permission, in_scope
from tests.conftest import make_user, requires_db

pytestmark = requires_db


def _as_current(user) -> CurrentUser:
    return CurrentUser(id=user.id, employee_code=user.employee_code, name=user.name, role=user.role)


async def _depth(db, ancestor_id: uuid.UUID, descendant_id: uuid.UUID) -> int | None:
    await set_rls_context(db, user_id=str(ancestor_id), role="owner")
    stmt = select(ManagerHierarchyClosure.depth).where(
        ManagerHierarchyClosure.ancestor_id == ancestor_id,
        ManagerHierarchyClosure.descendant_id == descendant_id,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


# -- manager_hierarchy_closure maintenance -----------------------------------


async def test_closure_table_built_on_user_creation(db_session):
    owner = await make_user(db_session, employee_code="OWN100", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR100", name="Manager", role="manager", manager_id=owner.id
    )
    employee = await make_user(
        db_session,
        employee_code="EMP100",
        name="Employee",
        role="employee",
        manager_id=manager.id,
    )

    assert await _depth(db_session, owner.id, owner.id) == 0
    assert await _depth(db_session, owner.id, manager.id) == 1
    assert await _depth(db_session, owner.id, employee.id) == 2
    assert await _depth(db_session, manager.id, employee.id) == 1
    # An employee is never an ancestor of their manager.
    assert await _depth(db_session, employee.id, manager.id) is None


async def test_reassigning_manager_moves_whole_subtree(db_session):
    owner = await make_user(db_session, employee_code="OWN101", name="Owner", role="owner")
    manager_a = await make_user(
        db_session, employee_code="MGR101", name="Manager A", role="manager", manager_id=owner.id
    )
    manager_b = await make_user(
        db_session, employee_code="MGR102", name="Manager B", role="manager", manager_id=owner.id
    )
    employee = await make_user(
        db_session,
        employee_code="EMP101",
        name="Employee",
        role="employee",
        manager_id=manager_a.id,
    )
    sub_employee = await make_user(
        db_session,
        employee_code="EMP102",
        name="Sub Employee",
        role="employee",
        manager_id=employee.id,
    )

    await set_rls_context(db_session, user_id=str(owner.id), role="owner")
    await hierarchy_service.reassign_manager(
        db_session, actor=_as_current(owner), user_id=employee.id, new_manager_id=manager_b.id
    )
    await db_session.commit()

    # employee and their subtree (sub_employee) are now under manager_b, not manager_a.
    assert await _depth(db_session, manager_b.id, employee.id) == 1
    assert await _depth(db_session, manager_b.id, sub_employee.id) == 2
    assert await _depth(db_session, manager_a.id, employee.id) is None
    assert await _depth(db_session, manager_a.id, sub_employee.id) is None
    # The employee -> sub_employee link itself is untouched by the move.
    assert await _depth(db_session, employee.id, sub_employee.id) == 1


async def test_cycle_prevention_rejects_making_a_manager_report_to_their_own_report(db_session):
    owner = await make_user(db_session, employee_code="OWN102", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR103", name="Manager", role="manager", manager_id=owner.id
    )
    employee = await make_user(
        db_session,
        employee_code="EMP103",
        name="Employee",
        role="employee",
        manager_id=manager.id,
    )

    await set_rls_context(db_session, user_id=str(owner.id), role="owner")
    from app.core.errors import ValidationFailedError

    try:
        await hierarchy_service.reassign_manager(
            db_session, actor=_as_current(owner), user_id=manager.id, new_manager_id=employee.id
        )
        raised = False
    except ValidationFailedError:
        raised = True
    assert raised, "reassigning a manager to report to their own report must be rejected"


# -- in_scope: the default hierarchy rule ------------------------------------


async def test_in_scope_owner_sees_everyone(db_session):
    owner = await make_user(db_session, employee_code="OWN103", name="Owner", role="owner")
    stranger = await make_user(db_session, employee_code="EMP104", name="Stranger", role="employee")

    await set_rls_context(db_session, user_id=str(owner.id), role="owner")
    assert await in_scope(db_session, _as_current(owner), stranger.id) is True


async def test_in_scope_self_always_true(db_session):
    employee = await make_user(db_session, employee_code="EMP105", name="Self", role="employee")
    await set_rls_context(db_session, user_id=str(employee.id), role="employee")
    assert await in_scope(db_session, _as_current(employee), employee.id) is True


async def test_in_scope_manager_sees_subtree_not_outside(db_session):
    owner = await make_user(db_session, employee_code="OWN104", name="Owner", role="owner")
    manager_a = await make_user(
        db_session, employee_code="MGR104", name="Manager A", role="manager", manager_id=owner.id
    )
    manager_b = await make_user(
        db_session, employee_code="MGR105", name="Manager B", role="manager", manager_id=owner.id
    )
    employee_under_a = await make_user(
        db_session,
        employee_code="EMP106",
        name="Employee Under A",
        role="employee",
        manager_id=manager_a.id,
    )
    employee_under_b = await make_user(
        db_session,
        employee_code="EMP107",
        name="Employee Under B",
        role="employee",
        manager_id=manager_b.id,
    )

    await set_rls_context(db_session, user_id=str(manager_a.id), role="manager")
    assert await in_scope(db_session, _as_current(manager_a), employee_under_a.id) is True
    assert await in_scope(db_session, _as_current(manager_a), employee_under_b.id) is False
    assert await in_scope(db_session, _as_current(manager_a), manager_b.id) is False


async def test_employee_cannot_access_another_employees_data(db_session):
    employee_a = await make_user(db_session, employee_code="EMP108", name="A", role="employee")
    employee_b = await make_user(db_session, employee_code="EMP109", name="B", role="employee")

    await set_rls_context(db_session, user_id=str(employee_a.id), role="employee")
    assert await in_scope(db_session, _as_current(employee_a), employee_b.id) is False

    from app.core.errors import NotFoundError

    # RLS hides another employee's row entirely, so the lookup reports "not found"
    # rather than "forbidden" (existence is not revealed).
    try:
        await user_service.get_user(
            db_session, actor=_as_current(employee_a), user_id=employee_b.id
        )
        raised = False
    except NotFoundError:
        raised = True
    assert raised


# -- has_permission: deny > allow > hierarchy > role default ------------------


async def test_role_default_allows_manager_to_create_project_globally(db_session):
    manager = await make_user(db_session, employee_code="MGR106", name="Manager", role="manager")
    await set_rls_context(db_session, user_id=str(manager.id), role="manager")
    allowed = await has_permission(
        db_session, _as_current(manager), "create_project", scope_type="global", scope_id=None
    )
    assert allowed is True


async def test_role_default_denies_cross_manager_visibility_without_a_grant(db_session):
    owner = await make_user(db_session, employee_code="OWN105", name="Owner", role="owner")
    manager_a = await make_user(
        db_session, employee_code="MGR107", name="Manager A", role="manager", manager_id=owner.id
    )
    manager_b = await make_user(
        db_session, employee_code="MGR108", name="Manager B", role="manager", manager_id=owner.id
    )

    await set_rls_context(db_session, user_id=str(manager_a.id), role="manager")
    allowed = await has_permission(
        db_session,
        _as_current(manager_a),
        "view_manager_reports",
        scope_type="user",
        scope_id=manager_b.id,
    )
    assert allowed is False


async def test_owner_grant_unlocks_cross_manager_visibility(db_session):
    owner = await make_user(db_session, employee_code="OWN106", name="Owner", role="owner")
    manager_a = await make_user(
        db_session, employee_code="MGR109", name="Manager A", role="manager", manager_id=owner.id
    )
    manager_b = await make_user(
        db_session, employee_code="MGR110", name="Manager B", role="manager", manager_id=owner.id
    )

    await set_rls_context(db_session, user_id=str(owner.id), role="owner")
    await permission_grant_service.create_grant(
        db_session,
        actor=_as_current(owner),
        payload=PermissionGrantCreateRequest(
            grantee_user_id=manager_a.id,
            permission_key="view_manager_reports",
            scope_type="user",
            scope_id=manager_b.id,
            effect="allow",
        ),
    )
    await db_session.commit()

    await set_rls_context(db_session, user_id=str(manager_a.id), role="manager")
    allowed = await has_permission(
        db_session,
        _as_current(manager_a),
        "view_manager_reports",
        scope_type="user",
        scope_id=manager_b.id,
    )
    assert allowed is True


async def test_explicit_deny_overrides_hierarchy_default(db_session):
    owner = await make_user(db_session, employee_code="OWN107", name="Owner", role="owner")
    manager = await make_user(
        db_session, employee_code="MGR111", name="Manager", role="manager", manager_id=owner.id
    )
    employee = await make_user(
        db_session,
        employee_code="EMP110",
        name="Employee",
        role="employee",
        manager_id=manager.id,
    )

    # Sanity check: without a deny grant, the manager is in scope of their
    # own direct report via the default hierarchy rule.
    await set_rls_context(db_session, user_id=str(manager.id), role="manager")
    assert await in_scope(db_session, _as_current(manager), employee.id) is True

    await set_rls_context(db_session, user_id=str(owner.id), role="owner")
    await permission_grant_service.create_grant(
        db_session,
        actor=_as_current(owner),
        payload=PermissionGrantCreateRequest(
            grantee_user_id=manager.id,
            permission_key="view_manager_reports",
            scope_type="user",
            scope_id=employee.id,
            effect="deny",
        ),
    )
    await db_session.commit()

    await set_rls_context(db_session, user_id=str(manager.id), role="manager")
    allowed = await has_permission(
        db_session,
        _as_current(manager),
        "view_manager_reports",
        scope_type="user",
        scope_id=employee.id,
    )
    assert allowed is False


async def test_revoked_grant_no_longer_applies(db_session):
    owner = await make_user(db_session, employee_code="OWN108", name="Owner", role="owner")
    manager_a = await make_user(
        db_session, employee_code="MGR112", name="Manager A", role="manager", manager_id=owner.id
    )
    manager_b = await make_user(
        db_session, employee_code="MGR113", name="Manager B", role="manager", manager_id=owner.id
    )

    await set_rls_context(db_session, user_id=str(owner.id), role="owner")
    grant = await permission_grant_service.create_grant(
        db_session,
        actor=_as_current(owner),
        payload=PermissionGrantCreateRequest(
            grantee_user_id=manager_a.id,
            permission_key="view_manager_team",
            scope_type="user",
            scope_id=manager_b.id,
            effect="allow",
        ),
    )
    await db_session.commit()

    await permission_grant_service.revoke_grant(
        db_session, actor=_as_current(owner), grant_id=grant.id
    )
    await db_session.commit()

    await set_rls_context(db_session, user_id=str(manager_a.id), role="manager")
    allowed = await has_permission(
        db_session,
        _as_current(manager_a),
        "view_manager_team",
        scope_type="user",
        scope_id=manager_b.id,
    )
    assert allowed is False
