"""Break RLS recursion cycles: service_calls<->service_assignments,
projects<->project_members

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-28

Security-audit finding: `service_calls_select` embeds a raw correlated
EXISTS into `service_assignments`, whose own SELECT/write policies embed a
raw EXISTS back into `service_calls` - a genuine mutual RLS dependency
cycle. The identical shape exists between `projects` and `project_members`.

Under a concrete authenticated role (owner/manager/employee - always set
via app/db/session.py:set_rls_context before any query this app issues),
`current_app_user_role() = ANY(...)` resolves to a definite TRUE/FALSE and
Postgres's planner can resolve every case this app's own traffic exercises
without expanding both sides of the cycle - which is why the full pytest
suite (112 tests) passed with 0 failures. But whenever
`current_app_user_role()` is NULL - which is exactly what a direct
anon/authenticated PostgREST request looks like, since this app's GUC is
only ever set inside its own transactions - the comparison evaluates to
NULL rather than a boolean, so Postgres cannot resolve the query without
expanding both tables' policies into each other, and errors with "infinite
recursion detected in policy for relation ...".

Confirmed via direct testing (SET ROLE anon/authenticated with no GUC set,
and separately with a real employee/manager RLS context) that this never
leaks a row: no policy branch ever resolves to TRUE for a NULL role, so the
practical effect today is either 0 rows or a hard SQL error, never real
data. Still fixed properly rather than left as a "currently harmless"
quirk - it is a structural fragility (a future change to either cycle, or a
Postgres planner change, could make it start affecting real authenticated
traffic instead of only unauthenticated/no-context connections).

Fix: extract each cross-table lookup that previously lived inline inside a
policy into a small `SECURITY DEFINER` helper function. Every such function
is created by (and therefore owned by) the migration-running role, which
has BYPASSRLS on this database (confirmed during the audit - see
docs/development-status.md), so a SECURITY DEFINER function's *internal*
queries run as that owner and never trigger RLS on the table they touch,
which is what breaks the cycle. Each function still evaluates against the
real caller's `app.user_id`/`app.user_role` session GUCs (those are
session-level state, unaffected by a SECURITY DEFINER privilege switch) -
this changes *how* the check is evaluated, never *what* it allows. Each
function is a faithful, unmodified extraction of the exact boolean
expression it replaces - including two cases (service_calls_select vs.
_update, project_members_select vs. _write) where the original inline
EXISTS clauses were subtly different from each other (one includes
`current_app_in_scope(...)`, the other doesn't) - those two get separate
functions rather than being merged, to avoid silently widening or
narrowing either policy.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_FUNCTIONS = (
    "current_app_has_active_assignment(uuid)",
    "current_app_is_assigned_employee_self(uuid)",
    "current_app_service_call_in_manager_scope(uuid)",
    "current_app_service_call_assign_access(uuid)",
    "current_app_is_active_project_member(uuid)",
    "current_app_project_owner_scope(uuid)",
    "current_app_is_project_owning_manager(uuid)",
)


def upgrade() -> None:
    # -- service_calls <-> service_assignments -------------------------------
    op.execute(
        """
        CREATE FUNCTION current_app_has_active_assignment(p_service_call_id uuid)
        RETURNS boolean AS $$
        BEGIN
            RETURN EXISTS (
                SELECT 1 FROM service_assignments sa
                WHERE sa.service_call_id = p_service_call_id AND sa.is_active
                  AND (
                      sa.employee_id = current_app_user_id()
                      OR current_app_in_scope(sa.employee_id)
                  )
            );
        END;
        $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
        """
    )
    op.execute(
        """
        CREATE FUNCTION current_app_is_assigned_employee_self(p_service_call_id uuid)
        RETURNS boolean AS $$
        BEGIN
            RETURN EXISTS (
                SELECT 1 FROM service_assignments sa
                WHERE sa.service_call_id = p_service_call_id AND sa.is_active
                  AND sa.employee_id = current_app_user_id()
            );
        END;
        $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
        """
    )
    op.execute(
        """
        CREATE FUNCTION current_app_service_call_in_manager_scope(p_service_call_id uuid)
        RETURNS boolean AS $$
        BEGIN
            RETURN EXISTS (
                SELECT 1 FROM service_calls sc
                WHERE sc.id = p_service_call_id
                  AND (
                      sc.responsible_manager_id = current_app_user_id()
                      OR current_app_in_scope(sc.responsible_manager_id)
                  )
            );
        END;
        $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
        """
    )
    op.execute(
        """
        CREATE FUNCTION current_app_service_call_assign_access(p_service_call_id uuid)
        RETURNS boolean AS $$
        BEGIN
            RETURN EXISTS (
                SELECT 1 FROM service_calls sc
                WHERE sc.id = p_service_call_id
                  AND current_app_can_access(
                      'assign_employees_to_service_call', 'user', sc.responsible_manager_id
                  )
            );
        END;
        $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
        """
    )

    op.execute("DROP POLICY service_calls_select ON service_calls")
    op.execute(
        """
        CREATE POLICY service_calls_select ON service_calls FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR responsible_manager_id = current_app_user_id()
            OR current_app_in_scope(responsible_manager_id)
            OR current_app_has_active_assignment(id)
        );
        """
    )

    op.execute("DROP POLICY service_calls_update ON service_calls")
    op.execute(
        """
        CREATE POLICY service_calls_update ON service_calls FOR UPDATE USING (
            current_app_user_role() IN ('system', 'owner')
            OR responsible_manager_id = current_app_user_id()
            OR current_app_in_scope(responsible_manager_id)
            OR current_app_is_assigned_employee_self(id)
        ) WITH CHECK (
            current_app_user_role() IN ('system', 'owner')
            OR responsible_manager_id = current_app_user_id()
            OR current_app_in_scope(responsible_manager_id)
            OR current_app_is_assigned_employee_self(id)
        );
        """
    )

    op.execute("DROP POLICY service_assignments_select ON service_assignments")
    op.execute(
        """
        CREATE POLICY service_assignments_select ON service_assignments FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR employee_id = current_app_user_id()
            OR current_app_in_scope(employee_id)
            OR current_app_service_call_in_manager_scope(service_call_id)
        );
        """
    )

    op.execute("DROP POLICY service_assignments_write ON service_assignments")
    op.execute(
        """
        CREATE POLICY service_assignments_write ON service_assignments FOR ALL USING (
            current_app_user_role() IN ('system', 'owner')
            OR current_app_service_call_in_manager_scope(service_call_id)
            OR current_app_service_call_assign_access(service_call_id)
        ) WITH CHECK (
            current_app_user_role() IN ('system', 'owner')
            OR current_app_service_call_in_manager_scope(service_call_id)
            OR current_app_service_call_assign_access(service_call_id)
        );
        """
    )

    # -- projects <-> project_members ----------------------------------------
    op.execute(
        """
        CREATE FUNCTION current_app_is_active_project_member(p_project_id uuid)
        RETURNS boolean AS $$
        BEGIN
            RETURN EXISTS (
                SELECT 1 FROM project_members pm
                WHERE pm.project_id = p_project_id
                  AND pm.user_id = current_app_user_id()
                  AND pm.is_active
            );
        END;
        $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
        """
    )
    op.execute(
        """
        CREATE FUNCTION current_app_project_owner_scope(p_project_id uuid)
        RETURNS boolean AS $$
        BEGIN
            RETURN EXISTS (
                SELECT 1 FROM projects p
                WHERE p.id = p_project_id
                  AND (
                      p.owning_manager_id = current_app_user_id()
                      OR current_app_in_scope(p.owning_manager_id)
                  )
            );
        END;
        $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
        """
    )
    op.execute(
        """
        CREATE FUNCTION current_app_is_project_owning_manager(p_project_id uuid)
        RETURNS boolean AS $$
        BEGIN
            RETURN EXISTS (
                SELECT 1 FROM projects p
                WHERE p.id = p_project_id AND p.owning_manager_id = current_app_user_id()
            );
        END;
        $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
        """
    )

    op.execute("DROP POLICY projects_select ON projects")
    op.execute(
        """
        CREATE POLICY projects_select ON projects FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR owning_manager_id = current_app_user_id()
            OR current_app_in_scope(owning_manager_id)
            OR current_app_is_active_project_member(id)
        );
        """
    )

    op.execute("DROP POLICY project_members_select ON project_members")
    op.execute(
        """
        CREATE POLICY project_members_select ON project_members FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR user_id = current_app_user_id()
            OR current_app_project_owner_scope(project_id)
        );
        """
    )

    op.execute("DROP POLICY project_members_write ON project_members")
    op.execute(
        """
        CREATE POLICY project_members_write ON project_members FOR ALL USING (
            current_app_user_role() IN ('system', 'owner')
            OR current_app_is_project_owning_manager(project_id)
            OR current_app_can_access('assign_employees_to_project', 'project', project_id)
        ) WITH CHECK (
            current_app_user_role() IN ('system', 'owner')
            OR current_app_is_project_owning_manager(project_id)
            OR current_app_can_access('assign_employees_to_project', 'project', project_id)
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY project_members_write ON project_members")
    op.execute(
        """
        CREATE POLICY project_members_write ON project_members FOR ALL USING (
            current_app_user_role() IN ('system', 'owner')
            OR EXISTS (
                SELECT 1 FROM projects p
                WHERE p.id = project_members.project_id
                  AND p.owning_manager_id = current_app_user_id()
            )
            OR current_app_can_access('assign_employees_to_project', 'project', project_id)
        ) WITH CHECK (
            current_app_user_role() IN ('system', 'owner')
            OR EXISTS (
                SELECT 1 FROM projects p
                WHERE p.id = project_members.project_id
                  AND p.owning_manager_id = current_app_user_id()
            )
            OR current_app_can_access('assign_employees_to_project', 'project', project_id)
        );
        """
    )

    op.execute("DROP POLICY project_members_select ON project_members")
    op.execute(
        """
        CREATE POLICY project_members_select ON project_members FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR user_id = current_app_user_id()
            OR EXISTS (
                SELECT 1 FROM projects p
                WHERE p.id = project_members.project_id
                  AND (
                      p.owning_manager_id = current_app_user_id()
                      OR current_app_in_scope(p.owning_manager_id)
                  )
            )
        );
        """
    )

    op.execute("DROP POLICY projects_select ON projects")
    op.execute(
        """
        CREATE POLICY projects_select ON projects FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR owning_manager_id = current_app_user_id()
            OR current_app_in_scope(owning_manager_id)
            OR EXISTS (
                SELECT 1 FROM project_members pm
                WHERE pm.project_id = projects.id
                  AND pm.user_id = current_app_user_id()
                  AND pm.is_active
            )
        );
        """
    )

    op.execute("DROP POLICY service_assignments_write ON service_assignments")
    op.execute(
        """
        CREATE POLICY service_assignments_write ON service_assignments FOR ALL USING (
            current_app_user_role() IN ('system', 'owner')
            OR EXISTS (
                SELECT 1 FROM service_calls sc
                WHERE sc.id = service_assignments.service_call_id
                  AND (
                      sc.responsible_manager_id = current_app_user_id()
                      OR current_app_in_scope(sc.responsible_manager_id)
                  )
            )
            OR EXISTS (
                SELECT 1 FROM service_calls sc
                WHERE sc.id = service_assignments.service_call_id
                  AND current_app_can_access(
                      'assign_employees_to_service_call', 'user', sc.responsible_manager_id
                  )
            )
        ) WITH CHECK (
            current_app_user_role() IN ('system', 'owner')
            OR EXISTS (
                SELECT 1 FROM service_calls sc
                WHERE sc.id = service_assignments.service_call_id
                  AND (
                      sc.responsible_manager_id = current_app_user_id()
                      OR current_app_in_scope(sc.responsible_manager_id)
                  )
            )
            OR EXISTS (
                SELECT 1 FROM service_calls sc
                WHERE sc.id = service_assignments.service_call_id
                  AND current_app_can_access(
                      'assign_employees_to_service_call', 'user', sc.responsible_manager_id
                  )
            )
        );
        """
    )

    op.execute("DROP POLICY service_assignments_select ON service_assignments")
    op.execute(
        """
        CREATE POLICY service_assignments_select ON service_assignments FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR employee_id = current_app_user_id()
            OR current_app_in_scope(employee_id)
            OR EXISTS (
                SELECT 1 FROM service_calls sc
                WHERE sc.id = service_assignments.service_call_id
                  AND (
                      sc.responsible_manager_id = current_app_user_id()
                      OR current_app_in_scope(sc.responsible_manager_id)
                  )
            )
        );
        """
    )

    op.execute("DROP POLICY service_calls_update ON service_calls")
    op.execute(
        """
        CREATE POLICY service_calls_update ON service_calls FOR UPDATE USING (
            current_app_user_role() IN ('system', 'owner')
            OR responsible_manager_id = current_app_user_id()
            OR current_app_in_scope(responsible_manager_id)
            OR EXISTS (
                SELECT 1 FROM service_assignments sa
                WHERE sa.service_call_id = service_calls.id AND sa.is_active
                  AND sa.employee_id = current_app_user_id()
            )
        ) WITH CHECK (
            current_app_user_role() IN ('system', 'owner')
            OR responsible_manager_id = current_app_user_id()
            OR current_app_in_scope(responsible_manager_id)
            OR EXISTS (
                SELECT 1 FROM service_assignments sa
                WHERE sa.service_call_id = service_calls.id AND sa.is_active
                  AND sa.employee_id = current_app_user_id()
            )
        );
        """
    )

    op.execute("DROP POLICY service_calls_select ON service_calls")
    op.execute(
        """
        CREATE POLICY service_calls_select ON service_calls FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR responsible_manager_id = current_app_user_id()
            OR current_app_in_scope(responsible_manager_id)
            OR EXISTS (
                SELECT 1 FROM service_assignments sa
                WHERE sa.service_call_id = service_calls.id AND sa.is_active
                  AND (
                      sa.employee_id = current_app_user_id()
                      OR current_app_in_scope(sa.employee_id)
                  )
            )
        );
        """
    )

    for signature in NEW_FUNCTIONS:
        op.execute(f"DROP FUNCTION IF EXISTS {signature}")
