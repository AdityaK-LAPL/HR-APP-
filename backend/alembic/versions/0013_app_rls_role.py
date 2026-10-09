"""Dedicated NOBYPASSRLS application role; inlinable scope function; revoke anon/authenticated

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-06

Security finding (see docs/development-status.md, "Performance review"): the
backend connects as Supabase's `postgres` role, which has BYPASSRLS, and never
switched role - so every RLS policy was silently skipped for application
queries and only the service layer enforced authorization.

This migration makes RLS a real second layer:

1. `hr_app_rls` - NOLOGIN, NOBYPASSRLS. The application runs
   `set_config('role', 'hr_app_rls', true)` at the start of each request's
   transaction (app/db/session.py:set_rls_context), so RLS applies to it.
   Append-only tables (audit_logs, task_history, leave_approvals) get only
   SELECT/INSERT. `alembic_version` is not granted.
2. `current_app_in_scope()` is re-created as an inlinable SQL function with the
   same semantics. As PL/pgSQL it was a per-row opaque call (~8.5 s for a
   manager's task list over 300k rows with RLS enforced); inlined, the planner
   turns it into an indexed closure-table lookup.
3. Supabase's default grants of every public table/function to `anon` and
   `authenticated` are revoked (this app never uses PostgREST). RLS already
   made them harmless; this removes the exposure entirely.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APPEND_ONLY = ("audit_logs", "task_history", "leave_approvals")


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hr_app_rls') THEN
                CREATE ROLE hr_app_rls NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
            END IF;
        END
        $$;
        """
    )
    op.execute("GRANT hr_app_rls TO CURRENT_USER WITH INHERIT FALSE, SET TRUE")
    op.execute("GRANT USAGE ON SCHEMA public TO hr_app_rls")

    # Revoke the Supabase defaults first, then grant exactly what the app needs.
    op.execute("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated")
    op.execute("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated")
    op.execute("REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated")
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated"
    )
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated"
    )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hr_app_rls")
    op.execute("REVOKE ALL ON alembic_version FROM hr_app_rls")
    for table in APPEND_ONLY:
        op.execute(f"REVOKE UPDATE, DELETE ON {table} FROM hr_app_rls")
    op.execute("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO hr_app_rls")
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hr_app_rls"
    )
    op.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO hr_app_rls")

    # Same semantics as the 0004 PL/pgSQL version (owner/system -> true; self -> true;
    # otherwise a closure-table lookup), as a single inlinable SQL expression.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION current_app_in_scope(p_target uuid) RETURNS boolean AS $$
            SELECT coalesce(
                current_app_user_role() IN ('owner', 'system')
                OR p_target = current_app_user_id()
                OR EXISTS (
                    SELECT 1 FROM manager_hierarchy_closure
                    WHERE ancestor_id = current_app_user_id() AND descendant_id = p_target
                ),
                false
            )
        $$ LANGUAGE sql STABLE;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION current_app_in_scope(p_target uuid) RETURNS boolean AS $$
        BEGIN
            IF current_app_user_role() IN ('owner', 'system') THEN
                RETURN true;
            END IF;
            IF p_target = current_app_user_id() THEN
                RETURN true;
            END IF;
            RETURN EXISTS (
                SELECT 1 FROM manager_hierarchy_closure
                WHERE ancestor_id = current_app_user_id() AND descendant_id = p_target
            );
        END;
        $$ LANGUAGE plpgsql STABLE;
        """
    )
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM hr_app_rls"
    )
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM hr_app_rls"
    )
    # Restore Supabase's stock grants.
    op.execute("GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated")
    op.execute("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC, anon, authenticated")
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated"
    )
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated"
    )
    op.execute("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM hr_app_rls")
    op.execute("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM hr_app_rls")
    op.execute("REVOKE USAGE ON SCHEMA public FROM hr_app_rls")
    op.execute("REVOKE hr_app_rls FROM CURRENT_USER")
    op.execute("DROP ROLE IF EXISTS hr_app_rls")
