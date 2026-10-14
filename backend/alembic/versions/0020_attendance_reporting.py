"""Attendance reporting: work mode at punch-in, leave kinds, company calendar, report permission

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-13

Everything the three downloadable sheets (individual monthly attendance, daily report of everyone,
leave card) and their analytics need and the application did not yet record:

* `attendance_days.work_mode` / `remark` - where the person is working today (office, home, on duty at
  a customer) and a free remark ("KSB Coimbatore"), chosen at punch-in.
* `leave_requests.leave_kind` - full day(s), half day (counts 0.5) or compensatory off (counts 0).
* `company_settings` (one row) - company name for the sheet titles, the weekly-off weekdays and the
  time after which a punch-in counts as late.
* `company_holidays` - the Owner's holiday list (removed softly, like everything else).
* the `download_company_reports` permission: lets the Owner give any manager (the HR person, say)
  company-wide attendance / leave reports and their downloads without a new role. Default: nobody.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE attendance_days
            ADD COLUMN work_mode varchar(20),
            ADD COLUMN remark text,
            ADD CONSTRAINT ck_attendance_days_work_mode_valid
                CHECK (work_mode IS NULL OR work_mode IN ('at_office', 'work_from_home', 'on_duty'))
        """
    )
    op.execute(
        """
        ALTER TABLE leave_requests
            ADD COLUMN leave_kind varchar(20) NOT NULL DEFAULT 'full_day',
            ADD CONSTRAINT ck_leave_requests_leave_kind_valid
                CHECK (leave_kind IN ('full_day', 'half_day', 'comp_off')),
            ADD CONSTRAINT ck_leave_requests_half_day_is_one_day
                CHECK (leave_kind <> 'half_day' OR start_date = end_date)
        """
    )

    op.execute(
        """
        CREATE TABLE company_settings (
            id smallint PRIMARY KEY DEFAULT 1 CONSTRAINT ck_company_settings_single_row CHECK (id = 1),
            company_name text NOT NULL DEFAULT 'Laser Automation',
            weekly_off_days smallint[] NOT NULL DEFAULT '{5,6}'
                CONSTRAINT ck_company_settings_weekdays CHECK (weekly_off_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
            late_after time NOT NULL DEFAULT '09:30',
            updated_at timestamptz NOT NULL DEFAULT now(),
            updated_by uuid REFERENCES users(id) ON DELETE RESTRICT
        )
        """
    )
    op.execute("INSERT INTO company_settings (id) VALUES (1)")
    op.execute(
        """
        CREATE TABLE company_holidays (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            holiday_date date NOT NULL,
            name text NOT NULL,
            is_active boolean NOT NULL DEFAULT true,
            created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_company_holidays_date UNIQUE (holiday_date)
        )
        """
    )
    for table in ("company_settings", "company_holidays"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        # Everyone signed in may read the company calendar (the leave and punch screens show it);
        # only the Owner changes it.
        op.execute(
            f"CREATE POLICY {table}_select ON {table} FOR SELECT USING (current_app_user_role() <> '')"
        )
        op.execute(
            f"""
            CREATE POLICY {table}_insert ON {table} FOR INSERT WITH CHECK (
                current_app_user_role() IN ('owner', 'system')
            )
            """
        )
        op.execute(
            f"""
            CREATE POLICY {table}_update ON {table} FOR UPDATE
                USING (current_app_user_role() IN ('owner', 'system'))
                WITH CHECK (current_app_user_role() IN ('owner', 'system'))
            """
        )

    op.execute(
        """
        INSERT INTO permission_definitions (key, description, applies_to_role) VALUES
        ('download_company_reports',
         'See and download company-wide attendance, daily and leave reports (xlsx) and their analytics',
         'manager')
        """
    )
    op.execute("INSERT INTO role_permissions (role, permission_key, allow) VALUES ('manager', 'download_company_reports', false)")


def downgrade() -> None:
    op.execute("DELETE FROM permission_grants WHERE permission_key = 'download_company_reports'")
    op.execute("DELETE FROM role_permissions WHERE permission_key = 'download_company_reports'")
    op.execute("DELETE FROM permission_definitions WHERE key = 'download_company_reports'")
    op.execute("DROP TABLE company_holidays")
    op.execute("DROP TABLE company_settings")
    op.execute(
        """
        ALTER TABLE leave_requests
            DROP CONSTRAINT ck_leave_requests_half_day_is_one_day,
            DROP CONSTRAINT ck_leave_requests_leave_kind_valid,
            DROP COLUMN leave_kind
        """
    )
    op.execute(
        """
        ALTER TABLE attendance_days
            DROP CONSTRAINT ck_attendance_days_work_mode_valid,
            DROP COLUMN remark,
            DROP COLUMN work_mode
        """
    )
