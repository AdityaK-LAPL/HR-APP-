"""Narrow people-directory lookup so every user can show names for the IDs in their data

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-09

Records reference people only by id (`assigned_by`, `current_approver_id`, `reviewed_by`,
`responsible_manager_id`, audit `actor_user_id` ...). `users_select` correctly hides other
users' profiles from an Employee, so an Employee had no way to show *who* assigned a task or
approved a leave (context.md section 3.1). `app_user_directory(ids)` returns only the
display fields - id, name, employee_code, designation, role, is_active - for the requested
ids, to any authenticated request context (not the login bootstrap context). It does not
return manager_id, timestamps or anything else, and it cannot enumerate: the caller must
already hold the (unguessable) UUIDs, at most 100 per call. Same pattern as
`app_user_stub()` (migration 0014).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION app_user_directory(p_ids uuid[])
        RETURNS TABLE (
            id uuid, name varchar, employee_code varchar, designation varchar,
            role varchar, is_active boolean
        ) AS $$
            SELECT u.id, u.name, u.employee_code, u.designation, u.role, u.is_active
            FROM users u
            WHERE u.id = ANY (p_ids)
              AND current_app_user_role() NOT IN ('', 'system')
            ORDER BY u.name
            LIMIT 100
        $$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
        """
    )
    op.execute(
        "REVOKE EXECUTE ON FUNCTION app_user_directory(uuid[]) FROM PUBLIC, anon, authenticated"
    )
    op.execute("GRANT EXECUTE ON FUNCTION app_user_directory(uuid[]) TO hr_app_rls")


def downgrade() -> None:
    op.execute("DROP FUNCTION app_user_directory(uuid[])")
