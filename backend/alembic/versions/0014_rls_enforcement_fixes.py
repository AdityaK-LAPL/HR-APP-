"""Policy fixes surfaced by enforcing RLS on application traffic

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-06

Migration 0013 made the application run as a NOBYPASSRLS role, so these
policies were exercised on real requests for the first time. Findings:

1. `leave_requests_update` WITH CHECK required `current_approver_id = me`, but a
   decision sets `current_approver_id` to NULL, so a manager could never approve
   or reject. The new row's check now allows the employee's manager chain
   (`current_app_in_scope(employee_id)`); the USING clause still requires the
   caller to be the pending approver (or the employee / owner), so who may touch
   a row is unchanged.
2. A manager holding an explicit `modify_project` / `delete_archive_project` /
   `assign_employees_to_project` grant on a project could not even see it, so the
   grant was useless. `projects_select` and `project_members_select` now also
   admit an explicit, unrevoked, unexpired ALLOW grant on that project that is
   not overridden by a DENY. Role defaults are deliberately not used for
   visibility.
3. Services validate a target user ("is this assignee active / a manager?")
   before applying permission checks, which needs to see users outside the
   caller's subtree (e.g. adding any employee to your project). Widening
   `users_select` would expose names and codes, so a narrow SECURITY DEFINER
   lookup, `app_user_stub()`, returns only id, role and is_active, and only
   inside an authenticated request context.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION current_app_has_explicit_allow(
            p_permission_key text, p_scope_type text, p_scope_id uuid
        ) RETURNS boolean AS $$
            SELECT EXISTS (
                SELECT 1 FROM permission_grants g
                WHERE g.grantee_user_id = current_app_user_id()
                  AND g.permission_key = p_permission_key
                  AND g.scope_type = p_scope_type
                  AND g.scope_id IS NOT DISTINCT FROM p_scope_id
                  AND g.effect = 'allow' AND g.revoked_at IS NULL
                  AND (g.expires_at IS NULL OR g.expires_at > now())
            ) AND NOT EXISTS (
                SELECT 1 FROM permission_grants g
                WHERE g.grantee_user_id = current_app_user_id()
                  AND g.permission_key = p_permission_key
                  AND g.scope_type = p_scope_type
                  AND g.scope_id IS NOT DISTINCT FROM p_scope_id
                  AND g.effect = 'deny' AND g.revoked_at IS NULL
                  AND (g.expires_at IS NULL OR g.expires_at > now())
            )
        $$ LANGUAGE sql STABLE;
        """
    )

    op.execute(
        """
        CREATE FUNCTION app_user_stub(p_user_id uuid)
        RETURNS TABLE (id uuid, role varchar, is_active boolean) AS $$
            SELECT u.id, u.role, u.is_active FROM users u
            WHERE u.id = p_user_id AND current_app_user_role() <> ''
        $$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
        """
    )
    op.execute("REVOKE EXECUTE ON FUNCTION app_user_stub(uuid) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION app_user_stub(uuid) TO hr_app_rls")
    op.execute(
        "REVOKE EXECUTE ON FUNCTION "
        "current_app_has_explicit_allow(text, text, uuid) FROM PUBLIC, anon, authenticated"
    )
    op.execute(
        "GRANT EXECUTE ON FUNCTION current_app_has_explicit_allow(text, text, uuid) TO hr_app_rls"
    )

    op.execute("DROP POLICY leave_requests_update ON leave_requests")
    op.execute(
        """
        CREATE POLICY leave_requests_update ON leave_requests FOR UPDATE USING (
            current_app_user_role() IN ('system', 'owner')
            OR employee_id = current_app_user_id()
            OR current_approver_id = current_app_user_id()
        ) WITH CHECK (
            current_app_user_role() IN ('system', 'owner')
            OR employee_id = current_app_user_id()
            OR current_app_in_scope(employee_id)
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
            OR current_app_is_active_project_member(id)
            OR current_app_has_explicit_allow('modify_project', 'project', id)
            OR current_app_has_explicit_allow('delete_archive_project', 'project', id)
            OR current_app_has_explicit_allow('assign_employees_to_project', 'project', id)
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
            OR current_app_has_explicit_allow('assign_employees_to_project', 'project', project_id)
        );
        """
    )


def downgrade() -> None:
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
    op.execute("DROP POLICY leave_requests_update ON leave_requests")
    op.execute(
        """
        CREATE POLICY leave_requests_update ON leave_requests FOR UPDATE USING (
            current_app_user_role() IN ('system', 'owner')
            OR employee_id = current_app_user_id()
            OR current_approver_id = current_app_user_id()
        ) WITH CHECK (
            current_app_user_role() IN ('system', 'owner')
            OR employee_id = current_app_user_id()
            OR current_approver_id = current_app_user_id()
        );
        """
    )
    op.execute("DROP FUNCTION app_user_stub(uuid)")
    op.execute("DROP FUNCTION current_app_has_explicit_allow(text, text, uuid)")
