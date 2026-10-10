"""Let a Manager edit a team member's profile and reset their password, as the contract says

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-09

The API contract (section 2 and section 1) promises that a Manager may change `name` and
`designation` of anyone in their reporting subtree and may reset that person's password.
The service layer implemented both, but row-level security (enforced on application traffic
since 0013) allowed `users`, `user_credentials` and `sessions` writes only to the Owner or the
row's own user, so both calls failed in production: the profile edit raised `StaleDataError`
(0 rows matched -> HTTP 500) and the reset could not even read the credentials row (404).
The frontend work for managers (Prompt 8) found it; the earlier suite only exercised the
Owner and the "outside the subtree" refusal.

What changes - deliberately narrow:

1. `users_update` additionally admits a Manager for users in their reporting subtree (the same
   set-based `IN (SELECT descendant_id ...)` form every other scope policy uses).
2. Because a policy cannot restrict *columns*, a trigger makes the privileged columns
   (`role`, `is_active`, `manager_id`, `employee_code`, `deactivated_at`) Owner-only at the
   database level. Until now only the service layer prevented a user from changing their own
   role; this closes that too.
3. `app_admin_reset_password(target, hash)` - a SECURITY DEFINER function that re-checks the
   caller is the Owner or an ancestor of `target`, then sets the temporary password, forces a
   change, clears the lockout and revokes the target's sessions. The credentials and sessions
   policies stay Owner-or-self, so a Manager can never *read* a password hash.
"""

# ruff: noqa: E501

from collections.abc import Sequence

from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SUBTREE = (
    "id IN (SELECT descendant_id FROM manager_hierarchy_closure "
    "WHERE ancestor_id = current_app_user_id())"
)


def upgrade() -> None:
    op.execute("DROP POLICY users_update ON users")
    op.execute(
        f"""
        CREATE POLICY users_update ON users FOR UPDATE USING (
            current_app_user_role() IN ('system', 'owner')
            OR id = current_app_user_id()
            OR (current_app_user_role() = 'manager' AND {SUBTREE})
        ) WITH CHECK (
            current_app_user_role() IN ('system', 'owner')
            OR id = current_app_user_id()
            OR (current_app_user_role() = 'manager' AND {SUBTREE})
        );
        """
    )

    op.execute(
        """
        CREATE FUNCTION users_guard_privileged_columns() RETURNS trigger AS $$
        BEGIN
            IF current_app_user_role() IN ('manager', 'employee') AND (
                NEW.role IS DISTINCT FROM OLD.role
                OR NEW.is_active IS DISTINCT FROM OLD.is_active
                OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
                OR NEW.employee_code IS DISTINCT FROM OLD.employee_code
                OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
            ) THEN
                RAISE EXCEPTION 'Only the Owner can change role, status, reporting line or employee id'
                    USING ERRCODE = '42501';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        "CREATE TRIGGER users_guard_privileged_columns BEFORE UPDATE ON users "
        "FOR EACH ROW EXECUTE FUNCTION users_guard_privileged_columns()"
    )

    op.execute(
        """
        CREATE FUNCTION app_admin_reset_password(p_target uuid, p_hash text) RETURNS boolean AS $$
        BEGIN
            IF NOT (
                current_app_user_role() = 'owner'
                OR (
                    current_app_user_role() = 'manager'
                    AND EXISTS (
                        SELECT 1 FROM manager_hierarchy_closure c
                        WHERE c.ancestor_id = current_app_user_id()
                          AND c.descendant_id = p_target
                          AND c.depth > 0
                    )
                )
            ) THEN
                RAISE EXCEPTION 'Not permitted to reset this password' USING ERRCODE = '42501';
            END IF;

            UPDATE user_credentials
               SET password_hash = p_hash,
                   must_reset = true,
                   password_changed_at = now(),
                   failed_attempts = 0,
                   locked_until = NULL
             WHERE user_id = p_target;
            IF NOT FOUND THEN
                RETURN false;
            END IF;

            UPDATE sessions SET revoked_at = now() WHERE user_id = p_target AND revoked_at IS NULL;
            RETURN true;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
        """
    )
    op.execute("REVOKE EXECUTE ON FUNCTION app_admin_reset_password(uuid, text) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION app_admin_reset_password(uuid, text) TO hr_app_rls")


def downgrade() -> None:
    op.execute("DROP FUNCTION app_admin_reset_password(uuid, text)")
    op.execute("DROP TRIGGER users_guard_privileged_columns ON users")
    op.execute("DROP FUNCTION users_guard_privileged_columns()")
    op.execute("DROP POLICY users_update ON users")
    op.execute(
        """
        CREATE POLICY users_update ON users FOR UPDATE USING (
            current_app_user_role() IN ('system', 'owner') OR id = current_app_user_id()
        ) WITH CHECK (
            current_app_user_role() IN ('system', 'owner') OR id = current_app_user_id()
        );
        """
    )
