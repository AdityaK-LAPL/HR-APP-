# API Contract

Status: **Implemented (all 7 backend phases).** This is the contract the frontend (Antigravity) agent should build against. Every endpoint below is live code, not a plan — see `docs/development-status.md` for the one caveat that matters for integration testing: **the backend has not yet been run against a real PostgreSQL database in this environment**, so while the code is complete, internally consistent, linted, and its database-free tests pass, no endpoint that touches the database has been exercised end-to-end yet. UI development against this contract (forms, tables, routing, state shapes) can proceed now; true end-to-end testing against a live backend needs a database on one side or the other.

Three concrete artifacts back this document up:
- **`docs/openapi.json`** — the actual generated OpenAPI 3 schema (exported from the running app, not hand-written), usable directly with `openapi-typescript`, `orval`, Swagger/Redoc UIs, or any other codegen tool to get exact request/response types without transcribing this document by hand. Regenerate it any time after a backend change with `python -c "import json; from app.main import app; json.dump(app.openapi(), open('../docs/openapi.json', 'w'), indent=2)"` from `backend/`.
- **`GET /docs`** (Swagger UI) and **`GET /redoc`** — live interactive docs when the server is running (`uvicorn app.main:app --reload` from `backend/`, per `backend/README.md`), disabled automatically when `ENVIRONMENT=production`.
- This file (`api-contract.md`) — the one place that documents *permission* semantics (who can call what, and why), which OpenAPI has no way to express.

If `docs/openapi.json` and this file ever disagree on a request/response shape, trust `openapi.json` — it's generated from the real Pydantic schemas, this file is maintained by hand and can drift. If they disagree on *permission* rules, trust this file.

## Conventions

- Base path: `/api/v1`.
- Auth: cookie-based (httpOnly `access_token`, path `/`; httpOnly `refresh_token`, path `/api/v1/auth` only). Every endpoint below except `/auth/login` requires a valid session unless noted.
- CSRF: on login/refresh the server also sets a **non-httpOnly** `csrf_token` cookie. On every state-changing request (`POST`/`PATCH`/`DELETE`), the frontend must read that cookie and echo its value back as an `X-CSRF-Token` request header; a missing or mismatched header is rejected with `403`. `GET`/`HEAD`/`OPTIONS` requests don't need it. The frontend never needs to invent or store this value itself beyond reading the cookie the server already set.
- The API is called with `credentials: "include"` (or the client's equivalent) so cookies are sent; requests must originate from an origin listed in the server's CORS allow-list.
- All list endpoints support pagination (`?page=`, `?page_size=`) and return `{ items: [...], total, page, page_size }`.
- All timestamps are ISO 8601 UTC. Dates are `YYYY-MM-DD`.
- Standard error shape: `{ "error": { "code": "string", "message": "string" } }`. `403` when the caller can see the record but is not allowed to perform the action (e.g. an employee editing a field only a manager may change). `404` when the record is outside the caller's visibility — PostgreSQL row-level security (enforced on every application query since migration `0013`) hides rows the caller may not see, so the API answers "not found" and never confirms that the record exists. The frontend should treat both as "not allowed / not available".
- "Permission" column states the *server-side* rule; the frontend must not infer access from UI state.

---

## 1. Authentication

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `POST /auth/login` | Body `{employee_code, password}`. Sets access/refresh cookies. Returns user profile (no password fields). | None | Public |
| `POST /auth/logout` | Revokes current session. | Session | Self |
| `POST /auth/refresh` | Rotates refresh token, issues new access token. | Refresh cookie | Self |
| `GET /auth/me` | Returns current user's profile + role + manager_id. | Session | Self |
| `POST /auth/change-password` | Body `{current_password, new_password}`. | Session | Self |
| `POST /users/{id}/reset-password` | Admin-forced reset (no email/OTP recovery exists). Body `{temporary_password}`; sets `must_reset=true`, revokes all of that user's sessions. | Session | Owner (any user); Manager (only users in their subtree) |

---

## 2. Users

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /users` | List users. Filters: `manager_id`, `role`, `is_active`, `search` (name/employee_code/designation). | Session | Owner: all. Manager: self + subtree. Employee: self only. |
| `GET /users/{id}` | Get one user's profile. | Session | Owner: any. Manager: self/subtree. Employee: self. |
| `POST /users` | Create user. Body `{employee_code, name, designation, role, manager_id, initial_password}`. | Session | Owner only (Manager creation of employees is a possible future delegation — not enabled by default; see Open Questions). |
| `PATCH /users/{id}` | Update profile fields (`name`, `designation`), `role`, `is_active` (deactivate). **Does not accept `manager_id`** — reassigning a manager is exclusively `PATCH /hierarchy/{user_id}/manager` (see below), so there is one code path, one audit action, and the cycle-prevention/closure-table triggers are always in the loop. | Session | Owner: any field on any user. Manager: `name`/`designation` only, on subtree only. Self: `name`/`designation` only. |
| `GET /users/{id}/subordinates` | Direct + indirect reports (from closure table). | Session | Owner: any. Manager: self only. |

---

## 3. Hierarchy & Permissions (Owner configuration surface)

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /hierarchy` | Full org tree (or subtree for a Manager). | Session | Owner: full tree. Manager: own subtree. |
| `PATCH /hierarchy/{user_id}/manager` | Reassign a user's direct manager. Body `{manager_id}`. Triggers closure table recompute + audit log. | Session | Owner only. |
| `GET /permissions/definitions` | List available permission keys/descriptions. | Session | Owner (management UI), read-only for others if needed for UI hints. |
| `GET /permissions/grants` | List active grants. Filters: `grantee_user_id`, `permission_key`, `scope_type`. | Session | Owner only. |
| `POST /permissions/grants` | Create a grant/override. Body `{grantee_user_id, permission_key, scope_type, scope_id, effect, expires_at?}`. | Session | Owner only. |
| `DELETE /permissions/grants/{id}` | Soft-revoke a grant (`revoked_at`). | Session | Owner only. |

---

## 4. Tasks

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /tasks` | Filters: `assigned_to`, `project_id`, `status`, `date`, `date_range`. | Session | Owner: all. Manager: own + subtree's. Employee: own only. |
| `GET /tasks/{id}` | Task detail incl. assigner/assignee, project, dates. | Session | Same scoping as list, evaluated per-record. |
| `POST /tasks` | Create + assign a task. Body `{title, description, project_id?, assigned_to, priority, task_date, due_date?}`. | Session | Owner: any assignee. Manager: assignee must be self or in subtree, or an explicit `assign_tasks_to_manager` grant target. Employee: not permitted. |
| `PATCH /tasks/{id}` | Update fields incl. `status`, reassignment (`assigned_to`). Writes `task_history` rows for changed fields. | Session | Owner: any. Manager: tasks they created/assigned or that are in their subtree. Employee: may update `status` only on tasks assigned to them (per §3.1 — no other modification). |
| `GET /tasks/{id}/history` | Change log. | Session | Same as task detail. |

---

## 5. Projects

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /projects` | Filters: `status`, `member_id`, `manager_id`. | Session | Owner: all. Manager: owned + subtree-owned + member. Employee: projects they're a member of. |
| `GET /projects/{id}` | Detail incl. members, status. | Session | Same scoping. |
| `POST /projects` | Body `{name, description, status, start_date?, expected_end_date?}`. | Session | Owner: yes. Manager: yes only if `create_project` role-default/grant is allowed. |
| `PATCH /projects/{id}` | Edit fields incl. `status`. Setting `is_active: false` (archive) is authorized separately from every other field. | Session | Owner: any field. Manager, non-archive fields: the project's own owning manager, or anyone with a `modify_project` grant for that project. Manager, `is_active: false`: requires a `delete_archive_project` grant for that project **even for the project's own owning manager** — context.md section 8 calls this out as a distinct, Owner-controllable capability, not implied by ordinary edit access. |
| `GET /projects/{id}/members` | List members. | Session | Same as project detail. |
| `POST /projects/{id}/members` | Add member. Body `{user_id, role_in_project?}`. | Session | Owner: any. Manager: requires `assign_employees_to_project` grant/default. |
| `DELETE /projects/{id}/members/{user_id}` | Deactivate membership (soft). | Session | Same as add. |

---

## 6. Leave

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `POST /leaves` | Employee/Manager applies for leave. Body `{start_date, end_date, reason}`. Sets `current_approver_id` to the applicant's direct manager. | Session | Self (any role below Owner; Owner's own leave is a policy question — see Open Questions). |
| `GET /leaves` | Filters: `employee_id`, `status`, `date_range`. | Session | Owner: all. Manager: own + subtree's. Employee: own only. |
| `GET /leaves/{id}` | Detail incl. approval history. | Session | Same scoping. |
| `POST /leaves/{id}/approve` | Body `{comments?}`. Only valid if caller is `current_approver_id` or Owner, and the request is still `pending`. Implemented as single-level: one approval finalizes `status=approved` (the schema's `leave_approvals.sequence` supports a multi-step chain, not built — see Open Questions). | Session | `current_approver_id` or Owner. |
| `POST /leaves/{id}/reject` | Body `{comments}` (required — reason for rejection). | Session | `current_approver_id` or Owner. |
| `POST /leaves/{id}/cancel` | Employee withdraws a still-pending request. | Session | The requesting employee only, while `status=pending`. |

---

## 7. EOD Reports

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `POST /eod` | Submit EOD. Body `{report_date, project_id?, task_id?, work_completed, work_remaining, issues?, notes?}`. | Session | Self. |
| `GET /eod` | Filters: `user_id`, `project_id`, `date_range`. | Session | Owner: all. Manager: own + subtree's (including subordinate Managers', per §5.4). Employee: own only. |
| `GET /eod/{id}` | Detail. Attachments are fetched separately via `GET /attachments?entity_type=eod_report&entity_id=` (§15), not embedded. | Session | Same scoping. |

---

## 8. Attendance

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `POST /attendance/punch-in` | Body `{latitude?, longitude?}` (both optional; requested only at this moment, not polled). Creates an `attendance_events` row and upserts today's `attendance_days` row. `409` if already punched in today, or if today's in/out cycle is already complete (each day is one punch-in/punch-out pair — see Attendance note below). `work_date` is the UTC calendar date of the event. | Session | Self only — `user_id` is always the authenticated caller, never a request field. |
| `POST /attendance/punch-out` | Body `{latitude?, longitude?}`. `409` if not currently punched in, or already punched out today. Computes `total_duration_minutes` from today's punch-in time. | Session | Self only. |
| `GET /attendance` | Filters: `user_id`, `manager_id` (direct reports of that manager only, not their whole subtree), `start_date`, `end_date`. Returns paginated `attendance_days` rows. No `project_id` filter (attendance isn't linked to projects in this schema). | Session | Owner: all. Manager: own + subtree's. Employee: own only. |
| `GET /attendance/{user_id}/{work_date}/events` | Raw punch events for one user-day (audit/detail view). `work_date` is `YYYY-MM-DD`. | Session | Owner: any. Self: own. Manager: subtree only. |

**Attendance design note:** `attendance_days` is a derived one-row-per-user-per-day summary, so a user who has already completed a punch-in/punch-out pair today cannot punch in again the same day — the raw `attendance_events` log itself has no such limit, so a future "breaks / multiple sessions per day" feature can be built on it without a schema change, just a service-layer change.

---

## 9. Team Calendar

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /calendar` | Aggregated view: tasks (by `task_date`) + leave (by date-range overlap) within `start_date`..`end_date`, filterable by `user_id`, `project_id` (tasks only), `team` (direct reports of that manager). Read-only composite of tasks/leave data — no separate calendar table. Each entry is `{entry_date, entry_type: "task"\|"leave", user_id, title, status, project_id?}`. | Session | Owner: company-wide. Manager: own + full subtree. Employee: own only. |

**Implementation note (Phase 7):** scoping uses the same self-plus-subtree default rule as every other list endpoint in this codebase, not the finer-grained "subordinate-manager teams only with a `view_subordinate_manager_calendar` grant" originally sketched — introducing a different scoping algorithm for just this one endpoint would be inconsistent with, and harder to verify than, the uniform pattern used everywhere else. The `view_subordinate_manager_calendar` permission key still exists in the catalog (seeded in migration `0002`) for future use if the Owner needs finer control here specifically.

---

## 10. Customers

**Resolved default for Open Question 2 (Phase 5):** Owner and any Manager can view and create any customer — they need to search the full directory to log a new service call for a customer they've never touched before, so restricting visibility to "already assigned" would make that impossible. Employees see only customers reachable through an active service call assignment. *Editing* a customer is narrower than viewing one — see the `PATCH` row.

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /customers` | Filters/search: `name`, `customer_code`, `contact`, `machine_serial`. | Session | Owner: all. Manager: all. Employee: customers reachable via an active service call assignment. |
| `GET /customers/{id}` | Profile incl. `is_active`. Contacts, machines, and service history are fetched separately (see below), not embedded, so each has its own pagination/authorization rather than one endpoint owning several shapes. | Session | Same scoping as list. |
| `POST /customers` | Body `{customer_code, name, address?, notes?}`. | Session | Owner and Manager. |
| `PATCH /customers/{id}` | Edit profile fields. `is_active: false` (deactivate) is Owner-only. Non-deactivation fields: Owner any; Manager only if they created the customer (`created_by`) or have a service call for it in their scope — being able to *view* a customer (any Manager) does not by itself grant edit rights. | Session | See description. |
| `GET /customers/{id}/contacts` | List a customer's contacts. | Session | Same scoping as `GET /customers/{id}`. |
| `POST /customers/{id}/contacts` | Add a contact. | Session | Same edit scoping as `PATCH /customers/{id}`. |
| `PATCH /customers/{id}/contacts/{contact_id}` | Edit a contact. | Session | Same edit scoping as `PATCH /customers/{id}`. |

**Service history (context.md §23: Customer → Machines → Service Calls → Reports)** is reached by chaining existing list endpoints, not a dedicated aggregate endpoint: `GET /machines?customer_id=` for a customer's machines, then `GET /service-calls?customer_id=` or `?machine_id=` for that scope's calls (already ordered newest-first), then `GET /service-calls/{id}/reports` for each call's reports. This keeps exactly one, already-tested authorization implementation for "can this caller see this service data" instead of a second copy inside a history-specific endpoint. A dedicated `/reports/customer/{id}/history` convenience endpoint (pre-joining all of this server-side) remains possible in Phase 6 as a pure UI convenience, not a new authorization surface.

---

## 11. Machines

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /machines` | Filters/search: `serial_number`, `customer_id`, `model_name`. | Session | Owner: all. Manager: all (mirrors customer visibility — see §10). Employee: machines reachable via an active service call assignment. |
| `GET /machines/{id}` | Detail; service history via `GET /service-calls?machine_id=` (see §10 service-history note). | Session | Same scoping as list. |
| `POST /machines` | Body `{customer_id, machine_code, model_name?, serial_number?, installation_date?, purchase_info?, warranty_info?, location?}`. | Session | Owner/Manager. |
| `PATCH /machines/{id}` | Edit fields, `status`, `is_active`. `is_active: false` is Owner-only. Non-deactivation fields: Owner any; Manager if they created the machine or have an in-scope service call for it (same pattern as customers). | Session | See description. |

---

## 12. Service Calls

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `POST /service-calls` | Create immediately on customer contact (§16). Body `{service_call_code, customer_id, machine_id, reported_by_contact_id?, contacted_at, contact_method, issue_reported, priority, service_type, responsible_manager_id?}`. `responsible_manager_id` defaults to the creating Manager if omitted; a Manager may only set it to themselves or a manager in their own subtree, never arbitrarily. | Session | Owner/Manager. |
| `GET /service-calls` | Filters: `customer_id`, `machine_id`, `employee_id`, `manager_id`, `status`, `service_call_code`. | Session | Owner: all. Manager: responsible for, or with an assignment in their subtree. Employee: calls they're assigned to. |
| `GET /service-calls/{id}` | Full detail (assignments/visits/reports/status history are separate calls — see §13-14 — not embedded, same reasoning as customers §10). | Session | Same scoping. |
| `PATCH /service-calls/{id}` | Update `issue_reported`/`priority`/`status`/`resolution`. `responsible_manager_id` can also be changed here, Owner-only (not in the original design sketch — added because there was otherwise no way to reassign overall responsibility after creation). Status changes are audit-logged. | Session | Owner: any field. Manager: calls they're responsible for/subtree, any field except `responsible_manager_id`. Assigned Employee: `status` only, no other field in the same request. |
| `GET /service-calls/{id}/assignments` | List assignments (`?active_only=false` includes deactivated/reassigned-away rows). **Not in the original design sketch** — added because there was otherwise no way to see who is currently assigned to a call without already knowing an `assignment_id` (e.g. after a page reload). | Session | Same scoping as `GET /service-calls/{id}`. |
| `POST /service-calls/{id}/assign` | Assign an employee. Body `{employee_id, role_in_call?}`. Reassigning deactivates the prior row (`is_active=false`, `unassigned_at`) instead of overwriting it. | Session | Owner/responsible Manager (or Manager in that manager's subtree, or with an `assign_employees_to_service_call` grant scoped to that responsible manager). |
| `DELETE /service-calls/{id}/assign/{assignment_id}` | Unassign (soft). | Session | Same as assign. |

---

## 13. Service Visits

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `POST /service-calls/{id}/visits` | Record a field visit or online support session. Body `{visit_type, visit_date, arrival_time?, departure_time?, latitude?, longitude?, work_performed, problem_found?, parts_used?, action_taken?, result?, customer_signoff?}`. | Session | Assigned Employee (self) or responsible Manager or Owner. |
| `GET /service-calls/{id}/visits` | List visits for a call. | Session | Same scoping as service call detail. |
| `PATCH /service-visits/{id}` | Edit a visit record (e.g. before final report submission). | Session | The employee who created it, or Manager/Owner. |

---

## 14. Service Reports

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `POST /service-calls/{id}/report` | Submit final report after completing work (§21). Body `{service_visit_id?, report_datetime, work_performed, problem_found, root_cause?, action_taken, parts_used?, result, pending_work?, recommendations?, employee_comments?}`. | Session | Assigned Employee (self). |
| `GET /service-calls/{id}/reports` | List reports for a call. | Session | Owner: all. Manager: calls they're responsible for/subtree. Employee: **own submitted report(s) only** (resolved default for Open Question 3 — a teammate's report on the same call is not visible even if jointly assigned). |
| `GET /service-reports/{id}` | Single report detail. | Session | Same scoping. |
| `POST /service-reports/{id}/review` | Manager marks reviewed. Body `{comments?}`. Sets `reviewed_by`, `reviewed_at`. | Session | Responsible Manager or Owner. |

---

## 15. Attachments

Storage is backend-agnostic (`app/services/storage.py`): Supabase Storage when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are configured, otherwise a local-filesystem backend used automatically (this is what every environment so far — including this one — actually runs on, since no Supabase project has been connected). `entity_type` is one of `task`, `eod_report`, `project`, `customer`, `machine`, `service_call`, `service_report`.

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /attachments?entity_type=&entity_id=` | List active attachments on one entity. **Not in the original design sketch** — added because there was otherwise no way to discover which attachment IDs exist for a record before calling `GET /attachments/{id}` on each. | Session | Same read rule as the referenced entity itself. |
| `POST /attachments` | Multipart upload (`entity_type`, `entity_id` form fields + `file`). Rejects unknown extensions, oversized files (default 25MB), and content whose magic bytes don't match its extension (e.g. a renamed `.exe`) — not just an extension check. | Session | Entity-specific write access — e.g. a task's assignee/assigner/in-scope manager; a customer's edit-scoped manager (narrower than who can merely *view* the customer — see §10); a service report's author or the call's responsible manager. See `app/services/attachment_service.py`. |
| `GET /attachments/{id}` | Metadata plus `download_url` — the real Supabase signed URL in production, or this app's own `/attachments/{id}/download` route when using local storage. | Session | Same read rule as the referenced entity itself (reuses that entity's own authorized getter — one implementation, not a second copy here). |
| `GET /attachments/{id}/download` | Streams the file through the app (always works, both backends — the primary path for local storage, a fallback/proxy option for Supabase). | Session | Same as `GET /attachments/{id}`. |
| `DELETE /attachments/{id}` | Soft-remove (`is_active=false`; hidden from `GET`, file stays in storage). | Session | Uploader, or the same entity-specific write access as upload. |

---

## 16. Audit Logs

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /audit-logs` | Filters: `entity_type`, `entity_id`, `actor_user_id`, `action`, `start_date`, `end_date`. Paginated. | Session | Owner only. (Managers do not get raw audit access by default — they see the same information through entity-specific "history" endpoints like `/tasks/{id}/history`.) |

---

## 17. Notifications

Schema and API only — nothing in the backend produces a notification automatically yet (no service calls `POST`-equivalent "create a notification" when a task is assigned, a leave is decided, etc.). context.md section 28 explicitly allows this: "the first version does not have to implement every notification channel." Wiring producers into the existing task/leave/service-call services is future work that needs no further migration.

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /notifications` | Current user's notifications, filter `unread_only`. | Session | Self. |
| `POST /notifications/{id}/read` | Mark read. | Session | Self (must be the recipient). |
| `POST /notifications/read-all` | Mark all read. | Session | Self. |

---

## 18. Reports & Dashboards

Every report is scoped by hierarchy exactly like the underlying list endpoints (Owner: company-wide, Manager: subtree) — these are aggregates over data the caller could already see individually, not a new authorization surface. `average_resolution_minutes` in the service-activity report is an approximation (`updated_at - created_at` for `resolved`/`closed` calls), since there is no dedicated `resolved_at` timestamp in the schema.

**No `/reports/customer/{id}/history` or `/reports/machine/{id}/history` was built** — see the service-history note in §10; that data is already reachable via `GET /machines?customer_id=`, `GET /service-calls?customer_id=`/`?machine_id=`, and `GET /service-calls/{id}/reports`.

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /reports/attendance` | Per-user `{days_present, total_minutes}`, filterable by `start_date`/`end_date`/`manager_id` (direct reports of that manager). | Session | Owner: company-wide. Manager: subtree. Employee: 403. |
| `GET /reports/tasks` | Task counts grouped by `status`, filterable by `project_id`. | Session | Owner: company-wide. Manager: subtree. Employee: 403. |
| `GET /reports/leave` | Leave request counts grouped by `status`. | Session | Owner: company-wide. Manager: subtree. Employee: 403. |
| `GET /reports/workload` | Per-user `{open_task_count, active_service_assignment_count}`. | Session | Owner: company-wide. Manager: subtree. Employee: 403. |
| `GET /reports/service-activity` | Service call counts grouped by `status`, plus `average_resolution_minutes`, filterable by `manager_id`. | Session | Owner: company-wide. Manager: responsible-for/subtree. Employee: 403. |

---

## 19. Search

Search is implemented as filter parameters on the relevant list endpoints (`GET /customers?search=`, `GET /machines?search=`, `GET /users?search=`, `GET /service-calls?...`) rather than a separate unified search endpoint, keeping permission scoping identical to the underlying resource's list rule. A cross-entity `GET /search?q=` convenience endpoint may be added later purely as a UI affordance that fans out to the same scoped queries — not a new authorization surface.

---

## 20. Enums Reference

Every value below is enforced server-side with a Postgres `CHECK` constraint (see `backend/alembic/versions/`, constraint names `ck_*_valid`) — these are the exhaustive, authoritative value sets, not just current usage. Useful directly for frontend dropdowns, status badges, and filter controls without cross-referencing migration files.

| Field | Values |
|---|---|
| `users.role` | `owner`, `manager`, `employee` |
| `tasks.status` | `not_started`, `in_progress`, `blocked`, `completed`, `cancelled` |
| `tasks.priority` | `low`, `medium`, `high`, `urgent` |
| `projects.status` | `not_started`, `planning`, `in_progress`, `on_hold`, `completed`, `cancelled` |
| `leave_requests.status` | `pending`, `approved`, `rejected`, `cancelled` |
| `leave_approvals.decision` | `approved`, `rejected` |
| `attendance_events.event_type` | `punch_in`, `punch_out` |
| `attendance_days.status` | `present`, `partial`, `absent`, `on_leave` |
| `machines.status` | `active`, `inactive`, `decommissioned` |
| `service_calls.contact_method` | `phone`, `email`, `in_person`, `other` |
| `service_calls.priority` | `low`, `medium`, `high`, `urgent` |
| `service_calls.service_type` | `online_support`, `phone_support`, `remote_support`, `field_visit`, `other` |
| `service_calls.status` | `new`, `assigned`, `in_progress`, `waiting_customer`, `waiting_parts`, `remote_support`, `field_visit_scheduled`, `field_visit_completed`, `resolved`, `closed`, `reopened`, `cancelled` |
| `service_visits.visit_type` | `field_visit`, `online_support` |
| `attachments.entity_type` | `task`, `eod_report`, `project`, `customer`, `machine`, `service_call`, `service_report` |
| `permission_grants.scope_type` | `user`, `team`, `project`, `global` |
| `permission_grants.effect` | `allow`, `deny` |
| `permission_definitions.applies_to_role` | `manager`, `employee`, `any` |
| `calendar` entry `entry_type` (§9, derived, not a DB column) | `task`, `leave` |

The full catalog of `permission_key` strings (e.g. `create_project`, `assign_employees_to_service_call`) and their per-role defaults lives in `docs/permissions.md`, not here — that list is long enough, and specific enough to authorization logic, to warrant its own document rather than duplication.

---

## Getting Started for Frontend Integration

1. **Get exact types first.** Run the backend once (`uvicorn app.main:app --reload` from `backend/`, after `pip install -r requirements.txt` and a `.env` with at least a `JWT_SECRET_KEY` — a real `DATABASE_URL` is not required for the server to start or for `/docs`/`/openapi.json` to work, only for endpoints that actually query the database) and feed `docs/openapi.json` (or the live `/openapi.json`) into your codegen tool of choice for request/response TypeScript types. Don't hand-transcribe shapes from this document.
2. **Auth flow:** `POST /auth/login` with `credentials: "include"` → cookies are set automatically → read the `csrf_token` cookie and send it back as `X-CSRF-Token` on every subsequent `POST`/`PATCH`/`DELETE`. No token ever needs to be stored in JS-accessible storage.
3. **Every list response** follows the same envelope: `{ items, total, page, page_size }`. Build one generic paginated-table component against that shape rather than a bespoke one per resource.
4. **Every error response** follows `{ error: { code, message } }` with a real HTTP status (401/403/404/409/422) — build one generic error-toast/handler around that shape.
5. **What won't work yet:** any request that actually touches the database will fail in this environment until a real Postgres instance is connected (see `docs/development-status.md`) — expect connection errors, not `4xx`s, from those calls for now. UI/UX, forms, routing, and client-side validation can all be built and visually verified against mock/static data in the meantime; true integration testing resumes once the database is live.

---

## Open Questions Requiring a Business Decision

All four were implemented with a specific default rather than left blocking (see `docs/development-status.md` for the full list of such decisions across every phase); each remains easy to redirect if wrong.

1. Can Managers create new Employee users directly, or is user creation strictly Owner-only? **Implemented as Owner-only.**
2. Customer/machine visibility for Employees/Managers not explicitly assigned to a service call — is customer data company-wide-visible to all staff, or restricted to those with an active assignment/responsibility? **Implemented as a hybrid**: Owner/Manager see the full directory (needed to search and log new calls for anyone); Employees are assignment-scoped. Editing (not viewing) a customer/machine is narrower still — see §10.
3. Can an Employee view a teammate's service report on a call they're jointly assigned to, or only their own submitted report? **Implemented as own report only.**
4. Does the Owner submit/require their own EOD reports and attendance punches, or are those Employee/Manager-only concepts? **Implemented as optional** — nothing prevents the Owner from using `/eod`, `/leaves`, or `/attendance` for their own record.
