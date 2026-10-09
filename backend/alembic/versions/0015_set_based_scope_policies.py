"""Set-based hierarchy scope in RLS policies (performance)

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-06

With RLS enforced on application traffic (0013), policies that called
`current_app_in_scope(col)` ran a correlated closure-table probe per row
(~8-10 s for a manager's task count/report over 300k tasks). PostgreSQL only
turns `col IN (SELECT ...)` into a once-per-query hashed lookup when the
sub-select sits directly in the policy expression - not when it is hidden
inside a function (measured: inlined function, with or without coalesce, was
slower still). So each call is rewritten in place as the equivalent

    (role IN ('owner','system') OR col = me OR col IN (SELECT descendant_id
     FROM manager_hierarchy_closure WHERE ancestor_id = me))

which has identical semantics (and is what `current_app_in_scope` computes).
Measured on 300k tasks, manager role: task count 8.5 s -> 1.5 s, task report
8.1 s -> 0.6 s, sub-manager task page 9.5 s -> 1.9 s.

The 22 affected policies are listed below exactly as they were deployed after
0014 (captured from the live database); downgrade recreates them verbatim.
`current_app_in_scope()` itself is kept (used by `current_app_can_access`).
"""

# ruff: noqa: E501  (policy expressions are captured verbatim from the live database)

import re
from collections.abc import Sequence

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

POLICIES: tuple[tuple[str, str, str, str | None, str | None], ...] = (
    (
        "attendance_days",
        "attendance_days_select",
        "SELECT",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (user_id = current_app_user_id()) OR current_app_in_scope(user_id))",
        None,
    ),
    (
        "attendance_events",
        "attendance_events_select",
        "SELECT",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (user_id = current_app_user_id()) OR current_app_in_scope(user_id))",
        None,
    ),
    (
        "customer_contacts",
        "customer_contacts_write",
        "ALL",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (EXISTS ( SELECT 1 FROM customers c WHERE ((c.id = customer_contacts.customer_id) AND (c.created_by = current_app_user_id())))) OR (EXISTS ( SELECT 1 FROM service_calls sc WHERE ((sc.customer_id = customer_contacts.customer_id) AND ((sc.responsible_manager_id = current_app_user_id()) OR current_app_in_scope(sc.responsible_manager_id))))))",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (EXISTS ( SELECT 1 FROM customers c WHERE ((c.id = customer_contacts.customer_id) AND (c.created_by = current_app_user_id())))) OR (EXISTS ( SELECT 1 FROM service_calls sc WHERE ((sc.customer_id = customer_contacts.customer_id) AND ((sc.responsible_manager_id = current_app_user_id()) OR current_app_in_scope(sc.responsible_manager_id))))))",
    ),
    (
        "customers",
        "customers_update",
        "UPDATE",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (created_by = current_app_user_id()) OR (EXISTS ( SELECT 1 FROM service_calls sc WHERE ((sc.customer_id = customers.id) AND ((sc.responsible_manager_id = current_app_user_id()) OR current_app_in_scope(sc.responsible_manager_id))))))",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (created_by = current_app_user_id()) OR (EXISTS ( SELECT 1 FROM service_calls sc WHERE ((sc.customer_id = customers.id) AND ((sc.responsible_manager_id = current_app_user_id()) OR current_app_in_scope(sc.responsible_manager_id))))))",
    ),
    (
        "eod_reports",
        "eod_reports_select",
        "SELECT",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (user_id = current_app_user_id()) OR current_app_in_scope(user_id))",
        None,
    ),
    (
        "leave_approvals",
        "leave_approvals_select",
        "SELECT",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (EXISTS ( SELECT 1 FROM leave_requests lr WHERE ((lr.id = leave_approvals.leave_request_id) AND ((lr.employee_id = current_app_user_id()) OR current_app_in_scope(lr.employee_id))))))",
        None,
    ),
    (
        "leave_requests",
        "leave_requests_select",
        "SELECT",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (employee_id = current_app_user_id()) OR current_app_in_scope(employee_id))",
        None,
    ),
    (
        "leave_requests",
        "leave_requests_update",
        "UPDATE",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (employee_id = current_app_user_id()) OR (current_approver_id = current_app_user_id()))",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (employee_id = current_app_user_id()) OR current_app_in_scope(employee_id))",
    ),
    (
        "machines",
        "machines_update",
        "UPDATE",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (created_by = current_app_user_id()) OR (EXISTS ( SELECT 1 FROM service_calls sc WHERE ((sc.machine_id = machines.id) AND ((sc.responsible_manager_id = current_app_user_id()) OR current_app_in_scope(sc.responsible_manager_id))))))",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (created_by = current_app_user_id()) OR (EXISTS ( SELECT 1 FROM service_calls sc WHERE ((sc.machine_id = machines.id) AND ((sc.responsible_manager_id = current_app_user_id()) OR current_app_in_scope(sc.responsible_manager_id))))))",
    ),
    (
        "projects",
        "projects_select",
        "SELECT",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (owning_manager_id = current_app_user_id()) OR current_app_in_scope(owning_manager_id) OR current_app_is_active_project_member(id) OR current_app_has_explicit_allow('modify_project'::text, 'project'::text, id) OR current_app_has_explicit_allow('delete_archive_project'::text, 'project'::text, id) OR current_app_has_explicit_allow('assign_employees_to_project'::text, 'project'::text, id))",
        None,
    ),
    (
        "service_assignments",
        "service_assignments_select",
        "SELECT",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (employee_id = current_app_user_id()) OR current_app_in_scope(employee_id) OR current_app_service_call_in_manager_scope(service_call_id))",
        None,
    ),
    (
        "service_calls",
        "service_calls_insert",
        "INSERT",
        None,
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR ((current_app_user_role() = 'manager'::text) AND ((responsible_manager_id = current_app_user_id()) OR current_app_in_scope(responsible_manager_id))))",
    ),
    (
        "service_calls",
        "service_calls_select",
        "SELECT",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (responsible_manager_id = current_app_user_id()) OR current_app_in_scope(responsible_manager_id) OR current_app_has_active_assignment(id))",
        None,
    ),
    (
        "service_calls",
        "service_calls_update",
        "UPDATE",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (responsible_manager_id = current_app_user_id()) OR current_app_in_scope(responsible_manager_id) OR current_app_is_assigned_employee_self(id))",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (responsible_manager_id = current_app_user_id()) OR current_app_in_scope(responsible_manager_id) OR current_app_is_assigned_employee_self(id))",
    ),
    (
        "service_reports",
        "service_reports_select",
        "SELECT",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (employee_id = current_app_user_id()) OR (EXISTS ( SELECT 1 FROM service_calls sc WHERE ((sc.id = service_reports.service_call_id) AND ((sc.responsible_manager_id = current_app_user_id()) OR current_app_in_scope(sc.responsible_manager_id))))))",
        None,
    ),
    (
        "service_reports",
        "service_reports_update",
        "UPDATE",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (EXISTS ( SELECT 1 FROM service_calls sc WHERE ((sc.id = service_reports.service_call_id) AND ((sc.responsible_manager_id = current_app_user_id()) OR current_app_in_scope(sc.responsible_manager_id))))))",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (EXISTS ( SELECT 1 FROM service_calls sc WHERE ((sc.id = service_reports.service_call_id) AND ((sc.responsible_manager_id = current_app_user_id()) OR current_app_in_scope(sc.responsible_manager_id))))))",
    ),
    (
        "service_visits",
        "service_visits_select",
        "SELECT",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (employee_id = current_app_user_id()) OR (EXISTS ( SELECT 1 FROM service_calls sc WHERE ((sc.id = service_visits.service_call_id) AND ((sc.responsible_manager_id = current_app_user_id()) OR current_app_in_scope(sc.responsible_manager_id))))) OR (EXISTS ( SELECT 1 FROM service_assignments sa WHERE ((sa.service_call_id = service_visits.service_call_id) AND sa.is_active AND ((sa.employee_id = current_app_user_id()) OR current_app_in_scope(sa.employee_id))))))",
        None,
    ),
    (
        "service_visits",
        "service_visits_write",
        "ALL",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (employee_id = current_app_user_id()) OR (EXISTS ( SELECT 1 FROM service_calls sc WHERE ((sc.id = service_visits.service_call_id) AND ((sc.responsible_manager_id = current_app_user_id()) OR current_app_in_scope(sc.responsible_manager_id))))))",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (employee_id = current_app_user_id()) OR (EXISTS ( SELECT 1 FROM service_calls sc WHERE ((sc.id = service_visits.service_call_id) AND ((sc.responsible_manager_id = current_app_user_id()) OR current_app_in_scope(sc.responsible_manager_id))))))",
    ),
    (
        "task_history",
        "task_history_select",
        "SELECT",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (EXISTS ( SELECT 1 FROM tasks t WHERE ((t.id = task_history.task_id) AND ((t.assigned_to = current_app_user_id()) OR (t.assigned_by = current_app_user_id()) OR current_app_in_scope(t.assigned_to))))))",
        None,
    ),
    (
        "tasks",
        "tasks_insert",
        "INSERT",
        None,
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (assigned_to = current_app_user_id()) OR current_app_in_scope(assigned_to) OR ((current_app_user_role() = 'manager'::text) AND current_app_can_access('assign_tasks_to_manager'::text, 'user'::text, assigned_to)))",
    ),
    (
        "tasks",
        "tasks_select",
        "SELECT",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (assigned_to = current_app_user_id()) OR (assigned_by = current_app_user_id()) OR current_app_in_scope(assigned_to))",
        None,
    ),
    (
        "tasks",
        "tasks_update",
        "UPDATE",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (assigned_to = current_app_user_id()) OR (assigned_by = current_app_user_id()) OR current_app_in_scope(assigned_to))",
        "((current_app_user_role() = ANY (ARRAY['system'::text, 'owner'::text])) OR (assigned_to = current_app_user_id()) OR current_app_in_scope(assigned_to) OR ((current_app_user_role() = 'manager'::text) AND current_app_can_access('assign_tasks_to_manager'::text, 'user'::text, assigned_to)))",
    ),
)

_CALL = re.compile(r"current_app_in_scope\(([^()]*)\)")


def _set_based(expression: str) -> str:
    def repl(match: re.Match[str]) -> str:
        col = match.group(1).strip()
        return (
            "(current_app_user_role() IN ('owner', 'system') "
            f"OR {col} = current_app_user_id() "
            f"OR {col} IN (SELECT scope_c.descendant_id FROM manager_hierarchy_closure scope_c "
            "WHERE scope_c.ancestor_id = current_app_user_id()))"
        )

    return _CALL.sub(repl, expression)


def _recreate(transform) -> None:
    for table, name, cmd, using, check in POLICIES:
        op.execute(f"DROP POLICY {name} ON {table}")
        clauses = []
        if using is not None:
            clauses.append(f"USING ({transform(using)})")
        if check is not None:
            clauses.append(f"WITH CHECK ({transform(check)})")
        op.execute(f"CREATE POLICY {name} ON {table} FOR {cmd} {' '.join(clauses)}")


def upgrade() -> None:
    _recreate(_set_based)


def downgrade() -> None:
    _recreate(lambda expression: expression)
