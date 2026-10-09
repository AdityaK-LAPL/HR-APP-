"""Enforce the manager-visibility permissions: view_manager_team / view_manager_reports

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-09

API-contract audit (Prompt 4) found that `view_manager_team`, `view_manager_reports`
and `view_subordinate_manager_calendar` were in the permission catalog and could be
granted, but nothing enforced them. This migration makes the database honour them.

`app_visible_user_ids(kind)` returns the set of users whose data of that kind the
caller may read:

    Owner/system -> everyone
    otherwise    -> {self}
                    + the caller's reporting subtree           (default hierarchy rule)
                    + subtree(B) for every active ALLOW grant   (permission_key, scope_type='user',
                                                                 scope_id=B)
                    - subtree(D) for every active DENY grant    (deny wins over allow and over
                                                                 the hierarchy; the caller can
                                                                 always see themself)

`kind` maps to the permission key: team -> view_manager_team, reports ->
view_manager_reports (EOD reports, tasks, attendance), calendar ->
view_subordinate_manager_calendar. A grant scoped to manager B covers B and B's whole
subtree - the same set B themself would see - which is the reading of "Manager A can
see Manager B's team/reports" in docs/permissions.md. It is SECURITY DEFINER because it
must read hierarchy rows of other managers' subtrees; it depends only on the
`app.user_id` / `app.user_role` settings the server sets per request.

Only SELECT policies change (visibility). Write policies keep the plain hierarchy rule:
viewing a peer's reports never lets you modify them.
"""

# ruff: noqa: E501

from collections.abc import Sequence

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

VISIBLE = "app_visible_user_ids"


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION app_visible_user_ids(p_kind text) RETURNS SETOF uuid AS $$
            WITH ident AS (
                SELECT current_app_user_id() AS me,
                       current_app_user_role() AS role,
                       CASE p_kind
                           WHEN 'team' THEN 'view_manager_team'
                           WHEN 'reports' THEN 'view_manager_reports'
                           WHEN 'calendar' THEN 'view_subordinate_manager_calendar'
                       END AS permission_key
            ),
            denied AS (
                SELECT c.descendant_id AS uid
                FROM permission_grants g
                JOIN manager_hierarchy_closure c ON c.ancestor_id = g.scope_id
                JOIN ident ON g.grantee_user_id = ident.me
                WHERE g.permission_key = ident.permission_key
                  AND g.scope_type = 'user' AND g.effect = 'deny'
                  AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > now())
            )
            SELECT u.id FROM users u JOIN ident ON ident.role IN ('owner', 'system')
            UNION
            SELECT ident.me FROM ident WHERE ident.me IS NOT NULL
            UNION
            SELECT c.descendant_id
            FROM manager_hierarchy_closure c JOIN ident ON c.ancestor_id = ident.me
            WHERE c.descendant_id NOT IN (SELECT uid FROM denied)
            UNION
            SELECT c.descendant_id
            FROM permission_grants g
            JOIN manager_hierarchy_closure c ON c.ancestor_id = g.scope_id
            JOIN ident ON g.grantee_user_id = ident.me
            WHERE g.permission_key = ident.permission_key
              AND g.scope_type = 'user' AND g.effect = 'allow'
              AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > now())
              AND c.descendant_id NOT IN (SELECT uid FROM denied)
        $$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
        """
    )
    op.execute("REVOKE EXECUTE ON FUNCTION app_visible_user_ids(text) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION app_visible_user_ids(text) TO hr_app_rls")

    # -- team: who appears in user lists / the hierarchy ----------------------------------
    op.execute("DROP POLICY users_select ON users")
    op.execute(
        """
        CREATE POLICY users_select ON users FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR id = current_app_user_id()
            OR id IN (SELECT app_visible_user_ids('team'))
        );
        """
    )
    op.execute("DROP POLICY manager_hierarchy_closure_select ON manager_hierarchy_closure")
    op.execute(
        """
        CREATE POLICY manager_hierarchy_closure_select ON manager_hierarchy_closure
        FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR ancestor_id = current_app_user_id()
            OR descendant_id = current_app_user_id()
            OR (
                ancestor_id IN (SELECT app_visible_user_ids('team'))
                AND descendant_id IN (SELECT app_visible_user_ids('team'))
            )
        );
        """
    )

    # -- reports: EOD reports, tasks, attendance ------------------------------------------
    op.execute("DROP POLICY tasks_select ON tasks")
    op.execute(
        """
        CREATE POLICY tasks_select ON tasks FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR assigned_to = current_app_user_id()
            OR assigned_by = current_app_user_id()
            OR assigned_to IN (SELECT app_visible_user_ids('reports'))
        );
        """
    )
    op.execute("DROP POLICY task_history_select ON task_history")
    op.execute(
        """
        CREATE POLICY task_history_select ON task_history FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR EXISTS (
                SELECT 1 FROM tasks t
                WHERE t.id = task_history.task_id
                  AND (
                    t.assigned_to = current_app_user_id()
                    OR t.assigned_by = current_app_user_id()
                    OR t.assigned_to IN (SELECT app_visible_user_ids('reports'))
                  )
            )
        );
        """
    )
    for table in ("eod_reports", "attendance_days", "attendance_events"):
        op.execute(f"DROP POLICY {table}_select ON {table}")
        op.execute(
            f"""
            CREATE POLICY {table}_select ON {table} FOR SELECT USING (
                current_app_user_role() IN ('system', 'owner')
                OR user_id = current_app_user_id()
                OR user_id IN (SELECT app_visible_user_ids('reports'))
            );
            """
        )


def downgrade() -> None:
    scope = (
        "(current_app_user_role() IN ('owner', 'system') OR {c} = current_app_user_id() "
        "OR {c} IN (SELECT scope_c.descendant_id FROM manager_hierarchy_closure scope_c "
        "WHERE scope_c.ancestor_id = current_app_user_id()))"
    )
    for table in ("eod_reports", "attendance_days", "attendance_events"):
        op.execute(f"DROP POLICY {table}_select ON {table}")
        op.execute(
            f"CREATE POLICY {table}_select ON {table} FOR SELECT USING ("
            f"current_app_user_role() IN ('system', 'owner') OR user_id = current_app_user_id() "
            f"OR {scope.format(c='user_id')})"
        )
    op.execute("DROP POLICY task_history_select ON task_history")
    op.execute(
        "CREATE POLICY task_history_select ON task_history FOR SELECT USING ("
        "current_app_user_role() IN ('system', 'owner') OR EXISTS (SELECT 1 FROM tasks t "
        "WHERE t.id = task_history.task_id AND (t.assigned_to = current_app_user_id() "
        "OR t.assigned_by = current_app_user_id() OR " + scope.format(c="t.assigned_to") + ")))"
    )
    op.execute("DROP POLICY tasks_select ON tasks")
    op.execute(
        "CREATE POLICY tasks_select ON tasks FOR SELECT USING ("
        "current_app_user_role() IN ('system', 'owner') OR assigned_to = current_app_user_id() "
        "OR assigned_by = current_app_user_id() OR " + scope.format(c="assigned_to") + ")"
    )
    op.execute("DROP POLICY manager_hierarchy_closure_select ON manager_hierarchy_closure")
    op.execute(
        """
        CREATE POLICY manager_hierarchy_closure_select ON manager_hierarchy_closure FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR ancestor_id = current_app_user_id()
            OR descendant_id = current_app_user_id()
        );
        """
    )
    op.execute("DROP POLICY users_select ON users")
    op.execute(
        """
        CREATE POLICY users_select ON users FOR SELECT USING (
            current_app_user_role() IN ('system', 'owner')
            OR id = current_app_user_id()
            OR EXISTS (
                SELECT 1 FROM manager_hierarchy_closure c
                WHERE c.ancestor_id = current_app_user_id() AND c.descendant_id = users.id
            )
        );
        """
    )
    op.execute("DROP FUNCTION app_visible_user_ids(text)")
