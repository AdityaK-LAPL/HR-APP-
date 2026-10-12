"""Security hardening found by the final audit (Prompt 16)

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-12

1. SECURITY DEFINER functions run with their owner's rights, so each must pin its `search_path`:
   without it, a caller who can create objects earlier on the path (a temporary table named
   `users`, say) could make the function read or write something else. Seven functions had no
   `search_path` at all and four pinned `public` alone, which leaves `pg_temp` searched first.
   All now use `public, pg_temp`.
2. The application role could DELETE from every table although the application never deletes:
   history is kept by deactivation and soft removal. Removing the privilege makes that a database
   guarantee rather than a habit. `manager_hierarchy_closure` keeps it - the trigger that
   maintains it deletes and rewrites rows when someone changes manager.
3. `sessions.rotated_at` marks a refresh token that was swapped for a new one, so presenting it
   again can be told apart from a token that was merely revoked by a sign-out (reuse detection).
"""

from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE fn regprocedure;
        BEGIN
            FOR fn IN
                SELECT p.oid::regprocedure
                FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.prosecdef
            LOOP
                EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
            END LOOP;
        END $$;
        """
    )

    op.execute("REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM hr_app_rls")
    op.execute("GRANT DELETE ON manager_hierarchy_closure TO hr_app_rls")
    op.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE ON TABLES FROM hr_app_rls")

    op.execute("ALTER TABLE sessions ADD COLUMN rotated_at timestamptz")


def downgrade() -> None:
    op.execute("ALTER TABLE sessions DROP COLUMN rotated_at")
    op.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT DELETE ON TABLES TO hr_app_rls")
    op.execute("GRANT DELETE ON ALL TABLES IN SCHEMA public TO hr_app_rls")
    for table in ("audit_logs", "task_history", "leave_approvals"):
        op.execute(f"REVOKE DELETE ON {table} FROM hr_app_rls")
    op.execute("REVOKE ALL ON alembic_version FROM hr_app_rls")
