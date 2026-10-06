"""Indexes backing the newest-first list orderings for tasks and service calls

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-06

Evidence (EXPLAIN ANALYZE on a rolled-back synthetic dataset: 300k tasks,
60k service calls, 3.1k users, 3-level manager tree - see
docs/development-status.md, "Performance review"):

- `list_tasks` orders by `task_date DESC NULLS LAST, created_at DESC` with
  LIMIT/OFFSET. With no matching index Postgres seq-scanned `tasks` and
  sorted all matches for every page (owner page 1: ~612 ms; manager
  subtree: ~470-550 ms). With `ix_tasks_task_date_created_at` it walks the
  index and stops after one page (~6-9 ms).
- `list_service_calls` orders by `created_at DESC`. The manager's
  OR-of-subqueries filter seq-scanned `service_calls` (~187 ms); with
  `ix_service_calls_created_at` the same query takes ~25 ms.

Candidate indexes on `tasks(assigned_by)` and a partial
`service_assignments(service_call_id) WHERE is_active` were also measured and
NOT added: the planner never chose them for any query this app issues.

RLS policies are not touched; this only adds indexes.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX ix_tasks_task_date_created_at "
        "ON tasks (task_date DESC NULLS LAST, created_at DESC)"
    )
    op.execute("CREATE INDEX ix_service_calls_created_at ON service_calls (created_at DESC)")


def downgrade() -> None:
    op.execute("DROP INDEX ix_service_calls_created_at")
    op.execute("DROP INDEX ix_tasks_task_date_created_at")
