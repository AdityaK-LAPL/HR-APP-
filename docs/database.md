# Database Design

Status: **Proposed — pending approval.** Describes the target PostgreSQL schema (Supabase-hosted). No migrations have been created yet; this is the design that Alembic migrations will implement in Phase 1.

## 1. Conventions

- **Primary keys**: UUID (`gen_random_uuid()`, via `pgcrypto`/`pgcrypto`-equivalent `uuid-ossp` or native `gen_random_uuid()` in PG13+) for all tables. Rationale: IDs are exposed in API URLs; UUIDs avoid leaking record counts/sequence and avoid collisions if data is ever merged across environments.
- **Human-facing codes** (e.g. login ID, customer ID shown to staff) are separate readable columns (`employee_code`, `customer_code`, etc.), unique, indexed — distinct from the internal UUID primary key.
- **Timestamps**: every table has `created_at timestamptz not null default now()`; mutable tables also have `updated_at timestamptz not null default now()` maintained by an `updated_at` trigger.
- **Soft delete / deactivation**: entities that must be retained for history (`users`, `customers`, `machines`, `projects`) use `is_active boolean not null default true` + `deactivated_at timestamptz`, never a hard `DELETE`. Transactional/event records (tasks, EOD reports, attendance, leave, service records) are never deleted at all — only status-transitioned.
- **Foreign keys**: `ON DELETE RESTRICT` by default (nothing here should cascade-delete history); FKs to "soft-deletable" parents (e.g. `machines.customer_id`) stay `RESTRICT` — deactivating a customer never removes their machines/history.
- **Enums**: implemented as Postgres `CHECK` constraints on `text` columns (not native `ENUM` types) so adding a new status later is a simple constraint migration, not a type-altering migration.
- Naming: `snake_case`, singular concept / plural table name (`users`, `tasks`, `service_calls`).

## 2. Module Overview

| Module | Tables |
|---|---|
| Identity & Access | `users`, `user_credentials`, `sessions` |
| Hierarchy & Permissions | `manager_hierarchy_closure`, `permission_definitions`, `role_permissions`, `permission_grants` |
| Tasks | `tasks`, `task_history` |
| Projects | `projects`, `project_members` |
| Leave | `leave_requests`, `leave_approvals` |
| EOD | `eod_reports` |
| Attendance | `attendance_events`, `attendance_days` |
| Service Management | `customers`, `customer_contacts`, `machines`, `service_calls`, `service_assignments`, `service_visits`, `service_reports` |
| Cross-cutting | `attachments`, `audit_logs`, `notifications` |

---

## 3. Identity & Access

### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| employee_code | text unique not null | Login identifier; company-controlled, never a name |
| name | text not null | |
| designation | text | Free-text job title |
| role | text not null check in ('owner','manager','employee') | |
| manager_id | uuid FK → users.id, nullable | Direct reporting line; null for Owner (and any top-level manager reporting only to Owner, modeled as manager_id = Owner's id) |
| is_active | boolean not null default true | Deactivation instead of delete |
| deactivated_at | timestamptz | |
| created_by | uuid FK → users.id | Who created this account (Owner, or a Manager if delegated) |
| created_at / updated_at | timestamptz | |

Index: `(manager_id)`, `(role)`, unique `(employee_code)`.

### `user_credentials`
| Column | Type | Notes |
|---|---|---|
| user_id | uuid PK/FK → users.id | 1:1 with users |
| password_hash | text not null | Argon2id |
| must_reset | boolean not null default false | Forces password change on next login (e.g. after admin reset) |
| password_changed_at | timestamptz | |
| failed_attempts | int not null default 0 | For lockout/backoff |
| locked_until | timestamptz | |

Kept separate from `users` so ordinary profile queries never select credential material.

### `sessions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users.id | |
| refresh_token_hash | text not null | Never store raw token |
| user_agent | text | |
| ip_address | inet | |
| created_at | timestamptz | |
| expires_at | timestamptz not null | |
| revoked_at | timestamptz | Set on logout, password reset, or rotation |

Index: `(user_id)`, `(expires_at)`.

---

## 4. Hierarchy & Permissions

### `manager_hierarchy_closure`
Materialized transitive closure of the `users.manager_id` tree, maintained by a trigger whenever `users.manager_id` changes (recompute affected subtree) rather than recursive CTEs at read time.

| Column | Type | Notes |
|---|---|---|
| ancestor_id | uuid FK → users.id | |
| descendant_id | uuid FK → users.id | |
| depth | int not null | 0 = self row (every user is their own descendant at depth 0), 1 = direct report, etc. |

PK `(ancestor_id, descendant_id)`. Index on `(descendant_id)` for "who are my managers" lookups. Both FKs are `ON DELETE CASCADE` (not the usual `RESTRICT`) — this table is a pure derived/materialized index over `users.manager_id`, not a historical record in its own right, so it is fine for rows to disappear if a referenced user row ever did (in practice users are only ever deactivated, never deleted). Maintained entirely by two triggers on `users` added in migration `0002`: `sync_manager_hierarchy_closure` (standard closure-table re-parenting: on `INSERT` adds the self row plus one row per ancestor of the new manager; on `UPDATE OF manager_id` detaches the moved user's whole subtree from its old ancestor chain and re-attaches it under the new one) and `prevent_manager_hierarchy_cycle` (rejects setting `manager_id` to oneself or to any of one's own current descendants, which would otherwise create a cycle the closure table can't represent).

### `permission_definitions`
Catalog of permission keys the Owner can grant/deny. Examples: `view_manager_team`, `view_manager_reports`, `assign_tasks_to_manager`, `modify_project`, `assign_employees_to_project`, `view_subordinate_manager_calendar`.

| Column | Type |
|---|---|
| key | text PK |
| description | text |
| applies_to_role | text check in ('manager','employee','any') |

### `role_permissions`
Default permission set per role (baseline, before overrides).

| Column | Type |
|---|---|
| role | text | 
| permission_key | text FK → permission_definitions.key |
| allow | boolean |

PK `(role, permission_key)`.

### `permission_grants`
Owner-configured, per-relationship overrides — implements every example in `context.md` §12 ("Manager A can/cannot see Manager B's team", etc.).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| grantee_user_id | uuid FK → users.id | Who receives the grant/restriction |
| permission_key | text FK → permission_definitions.key | |
| scope_type | text check in ('user','team','project','global') | What the grant applies to |
| scope_id | uuid nullable | The target user/team(manager)/project id; null when scope_type='global' |
| effect | text check in ('allow','deny') | Explicit deny always wins over default/allow |
| granted_by | uuid FK → users.id | Must be an Owner (enforced in service layer) |
| expires_at | timestamptz nullable | Optional time-boxed grant |
| created_at | timestamptz | |
| revoked_at | timestamptz nullable | Soft-revoke, preserves audit trail of past grants |

Index: `(grantee_user_id, permission_key, scope_type, scope_id)`.

Full evaluation algorithm is in `permissions.md`.

---

## 5. Tasks

### `tasks`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| title | text not null | |
| description | text | |
| project_id | uuid FK → projects.id, nullable | |
| assigned_to | uuid FK → users.id | |
| assigned_by | uuid FK → users.id | |
| priority | text check in ('low','medium','high','urgent') | |
| status | text check in ('not_started','in_progress','blocked','completed','cancelled') | |
| task_date | date | Day the task applies to (for "select tasks for a particular day") |
| due_date | date nullable | |
| created_at / updated_at | timestamptz | |

Index: `(assigned_to, task_date)`, `(project_id)`, `(status)`.

### `task_history`
Append-only change log (who changed what, including reassignment) — separate from `audit_logs` because this feeds task-specific UI (e.g. "history" tab) directly.

| Column | Type |
|---|---|
| id | uuid PK |
| task_id | uuid FK → tasks.id |
| changed_by | uuid FK → users.id |
| field_changed | text |
| old_value | text |
| new_value | text |
| changed_at | timestamptz |

---

## 6. Projects

### `projects`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text not null | |
| description | text | |
| owning_manager_id | uuid FK → users.id | Manager responsible; Owner always has access |
| status | text check in ('not_started','planning','in_progress','on_hold','completed','cancelled') | |
| start_date / expected_end_date / actual_end_date | date nullable | |
| is_active | boolean default true | Archive instead of delete |
| created_at / updated_at | timestamptz | |

### `project_members`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK → projects.id | |
| user_id | uuid FK → users.id | |
| role_in_project | text nullable | Free-text responsibility label |
| assigned_by | uuid FK → users.id | |
| assigned_at | timestamptz | |
| is_active | boolean default true | Removal = deactivate membership, not delete (preserves "who worked on this project historically") |

Unique `(project_id, user_id)` where `is_active`.

---

## 7. Leave

### `leave_requests`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| employee_id | uuid FK → users.id | |
| start_date / end_date | date not null | |
| reason | text | |
| status | text check in ('pending','approved','rejected','cancelled') | |
| current_approver_id | uuid FK → users.id, nullable | Who needs to act next (supports multi-step chains — see Open Question in architecture.md) |
| created_at / updated_at | timestamptz | |

Index: `(employee_id, status)`, `(current_approver_id)`.

### `leave_approvals`
Append-only decision log — supports a single-level (direct manager) flow today and multi-level chains without a schema change.

| Column | Type |
|---|---|
| id | uuid PK |
| leave_request_id | uuid FK → leave_requests.id |
| approver_id | uuid FK → users.id |
| sequence | int | Step number in the approval chain |
| decision | text check in ('approved','rejected') |
| comments | text |
| decided_at | timestamptz |

---

## 8. EOD Reports

### `eod_reports`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users.id | Employee or Manager submitting their own EOD |
| report_date | date not null | |
| project_id | uuid FK → projects.id, nullable | |
| task_id | uuid FK → tasks.id, nullable | |
| work_completed | text | |
| work_remaining | text | |
| issues | text | |
| notes | text | |
| submitted_at | timestamptz | |

Index: `(user_id, report_date)`, `(project_id)`. Attachments (optional supporting info) live in the generic `attachments` table keyed to `entity_type='eod_report'`.

---

## 9. Attendance

Modeled as raw events plus a derived daily summary, matching `context.md` §4/§9's request for both an "attendance event" concept and day-level reports.

### `attendance_events`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users.id | |
| event_type | text check in ('punch_in','punch_out') | |
| event_time | timestamptz not null | |
| latitude / longitude | double precision, nullable | Captured only at punch time, never polled continuously |
| location_label | text nullable | Reverse-geocoded/human label if available |
| device_info | text nullable | User-agent/device string, only if legally justified per company policy |
| created_at | timestamptz | |

### `attendance_days`
Denormalized per-user-per-day summary, recomputed whenever a punch event for that day is inserted (keeps reporting queries — §9 — fast without recomputing from events each time).

| Column | Type |
|---|---|
| id | uuid PK |
| user_id | uuid FK → users.id |
| work_date | date not null |
| punch_in_time | timestamptz |
| punch_in_location | text |
| punch_out_time | timestamptz |
| punch_out_location | text |
| total_duration_minutes | int |
| status | text check in ('present','partial','absent','on_leave') |

Unique `(user_id, work_date)`. Index `(work_date)` for company-wide reports.

**Implementation note (Phase 4):** each day is modeled as exactly one punch-in/punch-out pair — a second punch-in the same day (after already completing a cycle) is rejected with `409`, not merged or overwritten. The raw `attendance_events` log has no such restriction, so a future "breaks / multiple sessions per day" feature can be layered on without a schema change. `work_date` is computed as the UTC calendar date of the punch event (no company timezone has been confirmed — see `architecture.md` §11 open question 7). RLS policies (migration `0006`) reuse the `current_app_in_scope()` helper from migration `0004` rather than duplicating the hierarchy check.

---

## 10. Service Management

### `customers`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| customer_code | text unique not null | Human-facing ID |
| name | text not null | |
| address | text | |
| notes | text | |
| is_active | boolean default true | |
| created_by | uuid FK → users.id, nullable | **Added in Phase 5**, not in the original design sketch — needed so the creating Manager can still edit a customer that has no service call yet (edit-scoping otherwise has nothing to derive from before any call exists). See `api-contract.md` §10. |
| created_at / updated_at | timestamptz | |

### `customer_contacts`
| Column | Type |
|---|---|
| id | uuid PK |
| customer_id | uuid FK → customers.id |
| name | text |
| designation | text |
| phone | text |
| email | text |
| is_primary | boolean default false |

### `machines`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| machine_code | text unique not null | |
| customer_id | uuid FK → customers.id | `RESTRICT` on delete — machine history must survive even if customer is deactivated |
| model_name | text | |
| serial_number | text unique | |
| installation_date | date | |
| purchase_info | text | |
| warranty_info | text | |
| location | text | |
| status | text check in ('active','inactive','decommissioned') | |
| is_active | boolean default true | |
| created_by | uuid FK → users.id, nullable | Added in Phase 5, same reasoning as `customers.created_by` above |
| created_at / updated_at | timestamptz | |

Index: `(customer_id)`, `(serial_number)` (search by serial per §27).

### `service_calls`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| service_call_code | text unique not null | |
| customer_id | uuid FK → customers.id | |
| machine_id | uuid FK → machines.id | |
| reported_by_contact_id | uuid FK → customer_contacts.id, nullable | |
| contacted_at | timestamptz not null | When the customer contacted the company — recorded immediately per §16 |
| contact_method | text check in ('phone','email','in_person','other') | |
| issue_reported | text not null | |
| priority | text check in ('low','medium','high','urgent') | |
| service_type | text check in ('online_support','phone_support','remote_support','field_visit','other') | |
| responsible_manager_id | uuid FK → users.id | |
| status | text check in ('new','assigned','in_progress','waiting_customer','waiting_parts','remote_support','field_visit_scheduled','field_visit_completed','resolved','closed','reopened','cancelled') | |
| resolution | text | |
| created_at / updated_at | timestamptz | |

Index: `(customer_id)`, `(machine_id)`, `(status)`, `(responsible_manager_id)`.

**Implementation note (Phase 5):** `responsible_manager_id` is not client-supplied on creation by default — it defaults to the creating Manager, matching the request body documented in `api-contract.md` §12 (which never listed it as a field). A Manager may only set it explicitly to themselves or a manager in their own subtree; the Owner may set it to anyone. Changing it after creation is Owner-only, via `PATCH /service-calls/{id}` — this endpoint gained that capability in Phase 5 since the original design had no way to reassign overall responsibility at all.

### `service_assignments`
Employee(s) assigned to a service call; reassignment preserves prior rows instead of overwriting (§18).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| service_call_id | uuid FK → service_calls.id | |
| employee_id | uuid FK → users.id | |
| assigned_by | uuid FK → users.id | |
| assigned_at | timestamptz | |
| role_in_call | text nullable | e.g. "primary", "support" |
| is_active | boolean default true | False once reassigned away; row is kept, not deleted |
| unassigned_at | timestamptz nullable | |

### `service_visits`
One row per actual work session — a field visit or an online/remote support session (§19–20).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| service_call_id | uuid FK → service_calls.id | |
| employee_id | uuid FK → users.id | |
| visit_type | text check in ('field_visit','online_support') | |
| visit_date | date | |
| arrival_time / departure_time | timestamptz nullable | Field visits only |
| latitude / longitude | double precision nullable | Captured for the visit only, not continuous tracking |
| work_performed | text | |
| problem_found | text | |
| parts_used | text | |
| action_taken | text | |
| result | text | |
| customer_signoff | text nullable | Name/note; e-signature is a future requirement (§36) |
| created_at | timestamptz | |

### `service_reports`
The formal report submitted after completing work (§21), reviewed by Manager/Owner. References the call and, where applicable, the specific visit.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| service_call_id | uuid FK → service_calls.id | |
| service_visit_id | uuid FK → service_visits.id, nullable | |
| employee_id | uuid FK → users.id | |
| report_datetime | timestamptz | |
| service_type | text | Mirrors call/visit type at time of report |
| work_performed | text | |
| problem_found | text | |
| root_cause | text nullable | |
| action_taken | text | |
| parts_used | text | |
| result | text | |
| pending_work | text | |
| recommendations | text | |
| employee_comments | text | |
| reviewed_by | uuid FK → users.id, nullable | Manager who reviewed |
| reviewed_at | timestamptz nullable | |
| submitted_at | timestamptz | |

Index: `(service_call_id)`, `(employee_id)`.

---

## 11. Cross-Cutting

### `attachments`
Polymorphic association so any business record can carry files (task, EOD report, project, customer, machine, service call, service report).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| entity_type | text check in ('task','eod_report','project','customer','machine','service_call','service_report') | |
| entity_id | uuid not null | No DB-level FK (polymorphic); integrity enforced in service layer |
| storage_path | text not null | Path within the storage backend (Supabase Storage bucket in production; a local directory in every environment without Supabase credentials configured, including this one — see `architecture.md` §6) |
| original_filename | text | |
| mime_type | text | |
| size_bytes | bigint | |
| uploaded_by | uuid FK → users.id | |
| is_active | boolean default true | **Added in Phase 6**, not in the original sketch — `DELETE /attachments/{id}` is documented as a soft-remove ("hide from listings; retained in storage/audit unless Owner purges"), which needs a flag to represent |
| created_at | timestamptz | |

Index: `(entity_type, entity_id)`.

**Implementation note (Phase 6):** since `entity_id` has no DB-level FK, RLS SELECT/INSERT/UPDATE policies (migration `0010`) use a dispatch function, `current_app_can_access_attachment_entity(entity_type, entity_id)`, that mirrors each referenced table's own existing visibility predicate (one `CASE`-style branch per `entity_type`) rather than granting or denying access without regard to the underlying record.

### `audit_logs`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| actor_user_id | uuid FK → users.id, nullable | Null only for system-initiated actions, if any |
| action | text not null | e.g. `user.created`, `task.reassigned`, `leave.approved`, `service_call.status_changed` |
| entity_type | text | |
| entity_id | uuid | |
| old_value | jsonb | |
| new_value | jsonb | |
| ip_address | inet | |
| created_at | timestamptz | |

Index: `(entity_type, entity_id)`, `(actor_user_id)`, `(created_at)`. A `BEFORE UPDATE OR DELETE` trigger (`prevent_audit_log_mutation`, migration `0002`) raises an exception unconditionally, so no role — not even Owner — can modify or remove a row through any code path; there is also no `UPDATE`/`DELETE` RLS policy on this table, so both layers independently deny it.

### `notifications`
| Column | Type |
|---|---|
| id | uuid PK |
| recipient_user_id | uuid FK → users.id |
| type | text |
| payload | jsonb |
| read_at | timestamptz nullable |
| created_at | timestamptz |

Index: `(recipient_user_id, read_at)`.

---

## 12. Historical-Record Guarantees (mapping to `context.md` §30)

| If this is deactivated... | ...this remains available |
|---|---|
| `users` (employee/manager leaves) | Their `tasks`, `task_history`, `eod_reports`, `attendance_events/days`, `leave_requests`, `service_assignments`, `service_reports` — all FKs are `RESTRICT`, never cascade-delete |
| `customers` | All `machines`, `service_calls`, `service_reports` for that customer |
| `machines` | All `service_calls`, `service_visits`, `service_reports` for that machine |
| `projects` | All `tasks`, `project_members` history, `eod_reports` referencing it |

No table in this schema issues a hard `DELETE` from the application layer except for reversing an unambiguous user mistake within the same request (e.g. deleting a draft never submitted) — and even that is a case-by-case service-layer decision, never a blanket cascade.

## 13. Indexing & Search Notes

- `pg_trgm` extension recommended for fuzzy/partial search on `customers.name`, `machines.model_name`, `machines.serial_number`, `users.name` (per §27 search requirements).
- **Measured indexes (migration `0012`, 2026-10-06)** - from `EXPLAIN ANALYZE` on a synthetic dataset (300k tasks, 60k service calls, 90k service assignments, 180k attendance days, 3.1k users in a 3-level manager tree), run inside a rolled-back transaction:
  - `ix_tasks_task_date_created_at` on `tasks (task_date DESC NULLS LAST, created_at DESC)` - backs `list_tasks`' newest-first ordering. Owner page 1: 612 ms -> 6.6 ms; manager subtree page: ~470-550 ms -> 6-9 ms (seq scan + full sort replaced by an index walk that stops after one page).
  - `ix_service_calls_created_at` on `service_calls (created_at DESC)` - backs `list_service_calls`' ordering. Manager list: 187 ms -> 25 ms.
  - Measured and **not** added (the planner never chose them): `tasks(assigned_by)`, partial `service_assignments(service_call_id) WHERE is_active`.
  - Already adequate: employee-scoped task/service-call lists (<=10 ms), closure-table lookups (index-only scans on the PK), customer name search (uses `ix_customers_name`), calendar and attendance-report queries.
  - Known limits left as-is: `ILIKE '%...%'` on `service_calls.service_call_code` and the second-level `customers`/`machines` search are seq scans (61 ms at 60k rows); `pg_trgm` GIN indexes are the fix if these grow. `COUNT(*)` for pagination totals and the manager task/status reports still scan the `tasks` table (~80-130 ms at 300k rows).
- Composite indexes called out per-table above are the minimum set; additional indexes will be added as query patterns are profiled during implementation.

## 14. Migration Tooling

Alembic, one migration per logical change, checked into version control. No destructive migration (dropping a column/table, changing a type in a lossy way) will be authored without explicit confirmation, per the working rules.
