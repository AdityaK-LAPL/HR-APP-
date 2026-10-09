# API Contract

Status: **Implemented and audited (Prompt 4, 2026-10-09).** Every endpoint below is live code and has been exercised against the real Supabase database (121 backend tests pass with PostgreSQL row-level security enforced on application traffic). This is the contract the frontend builds against. The audit compared the live FastAPI routes, the Pydantic schemas, the generated OpenAPI document and this file: all 84 operations match by method and path, and every request-body field name matches its schema. Differences found were fixed in the direction "the backend is authoritative" (this file was corrected, not the API), except two additive backend changes: validation errors now carry per-field `details`, and the OpenAPI document now declares the real error shape (it previously described FastAPI's unused default).

Three concrete artifacts back this document up:
- **`docs/openapi.json`** — the actual generated OpenAPI 3 schema (exported from the running app, not hand-written), usable directly with `openapi-typescript`, `orval`, Swagger/Redoc UIs, or any other codegen tool to get exact request/response types without transcribing this document by hand. Regenerate it (and the generated operation reference at the end of this file) after any backend change with `python -m scripts.contract_tools` from `backend/`; `python -m scripts.contract_tools --check` exits non-zero if either is stale.
- **`GET /docs`** (Swagger UI) and **`GET /redoc`** — live interactive docs when the server is running (`uvicorn app.main:app --reload` from `backend/`, per `backend/README.md`), disabled automatically when `ENVIRONMENT=production`.
- This file (`api-contract.md`) — the one place that documents *permission* semantics (who can call what, and why), which OpenAPI has no way to express.

If `docs/openapi.json` and this file ever disagree on a request/response shape, trust `openapi.json` — it's generated from the real Pydantic schemas, this file is maintained by hand and can drift. If they disagree on *permission* rules, trust this file.

## Conventions

- Base path: `/api/v1`.
- Auth: cookie-based (httpOnly `access_token`, path `/`; httpOnly `refresh_token`, path `/api/v1/auth` only). Every endpoint below except `/auth/login` requires a valid session unless noted.
- CSRF: on login/refresh the server also sets a **non-httpOnly** `csrf_token` cookie. On every state-changing request (`POST`/`PATCH`/`DELETE`), the frontend must read that cookie and echo its value back as an `X-CSRF-Token` request header; a missing or mismatched header is rejected with `403`. `GET`/`HEAD`/`OPTIONS` requests don't need it. The frontend never needs to invent or store this value itself beyond reading the cookie the server already set.
- The API is called with `credentials: "include"` (or the client's equivalent) so cookies are sent; requests must originate from an origin listed in the server's CORS allow-list.
- **List shapes differ by endpoint** — see §21 for the exact table. In short: 11 collection endpoints are paginated (`?page=` ≥ 1, default 1; `?page_size=` 1–100, default 25) and return `{ items, total, page, page_size }`; a few return `{ items }` or `{ items, total }` without paging; the rest of the sub-resource lists return a bare JSON array.
- Identifiers are UUID strings. Timestamps are ISO 8601 with timezone; dates are `YYYY-MM-DD`. Enum-valued fields are validated server-side: an invalid value in a request body is `422`, but an unknown value in a *query filter* (e.g. `?status=bogus`) is not an error and simply returns an empty list.
- All timestamps are ISO 8601 UTC instants. **Business calendar dates** (`work_date`, "today") are dates in the **company timezone, Asia/Kolkata (IST, UTC+05:30)** — not UTC and not the browser's timezone. Dates are `YYYY-MM-DD`. Read the timezone and the server's "today" from `GET /config`; never compute "today" from `Date()` in the browser.
- Standard error shape: `{ "error": { "code", "message", "details"? } }`. `code` is one of `authentication_failed` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `validation_failed` (422), `password_change_required` (403, see §1), `rate_limit_exceeded` (429, login/refresh only), `internal_error` (500, message carries a request id), `http_error` (other HTTP errors). `details` is present only on request-validation failures (`validation_failed` from malformed input) and is a list of `{field, message, type}` — one per invalid field, `field` being the request field name — so forms can show per-field errors; input values are never echoed back. Business-rule violations are also `422 validation_failed` but have no `details` (message only). `403` when the caller can see the record but is not allowed to perform the action (e.g. an employee editing a field only a manager may change). `404` when the record is outside the caller's visibility — PostgreSQL row-level security (enforced on every application query since migration `0013`) hides rows the caller may not see, so the API answers "not found" and never confirms that the record exists. The frontend should treat both as "not allowed / not available".
- "Permission" column states the *server-side* rule; the frontend must not infer access from UI state.

---

## 1. Authentication

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `POST /auth/login` | Body `{employee_code, password}`. Sets access/refresh cookies. Returns the user profile `{id, employee_code, name, designation, role, manager_id, is_active, must_reset}` (no password fields). **`must_reset: true`** means the account still has a temporary/admin-set password: the server then rejects every endpoint except `GET /auth/me`, `POST /auth/change-password` and `POST /auth/logout` with `403` `password_change_required` until the password is changed. Changing it revokes all sessions, so the client logs in again afterwards. | None | Public |
| `POST /auth/logout` | Revokes current session. | Session | Self |
| `POST /auth/refresh` | Rotates refresh token, issues new access token. Rate-limited with login (`429` `rate_limit_exceeded`). Login is also rate-limited per IP and locks an account after 5 consecutive failures. | Refresh cookie | Self |
| `GET /auth/me` | Returns current user's profile (same shape as login, including `must_reset`). Usable while `must_reset` is true. | Session | Self |
| `POST /auth/change-password` | Body `{current_password, new_password}`. | Session | Self |
| `GET /config` | `{company_timezone: "Asia/Kolkata", utc_offset_minutes: 330, today: "YYYY-MM-DD"}` — company timezone and the server's "today" in it. Fetch once at app start. | None | Public |
| `GET /health` | Liveness check, `{status}`. | None | Public |
| `GET /health/db` | Database connectivity; `503` with the standard error shape when the database is unreachable. | None | Public |
| `POST /users/{id}/reset-password` | Admin-forced reset (no email/OTP recovery exists). Body `{temporary_password}`; sets `must_reset=true`, revokes all of that user's sessions. | Session | Owner (any user); Manager (only users in their subtree) |

---

## 2. Users

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /users` | List users. Filters: `manager_id`, `role`, `is_active`, `search` (name/employee_code/designation). | Session | Owner: all. Manager: self + subtree. Employee: self only. |
| `GET /users/directory` | **Names for ids.** Query: repeat `?ids=<uuid>` (1–100). Returns `[{id, name, employee_code, designation, role, is_active}]` for the ids that exist (unknown ids are omitted; deactivated users are included with `is_active=false`). Open to every logged-in user and deliberately returns *only* those display fields — it is how an Employee shows who assigned a task / approved a leave / reviewed a report, which `GET /users/{id}` (scoped) cannot do. Cannot enumerate users: the caller must already hold the ids. | Session | Any logged-in user. |
| `GET /users/{id}` | Get one user's profile. | Session | Owner: any. Manager: self/subtree. Employee: self. |
| `POST /users` | Create user. Body `{employee_code, name, designation, role, manager_id, initial_password}`. | Session | Owner only (Manager creation of employees is a possible future delegation — not enabled by default; see Open Questions). |
| `PATCH /users/{id}` | Update profile fields (`name`, `designation`), `role`, `is_active` (deactivate). **Does not accept `manager_id`** — reassigning a manager is exclusively `PATCH /hierarchy/{user_id}/manager` (see below), so there is one code path, one audit action, and the cycle-prevention/closure-table triggers are always in the loop. | Session | Owner: any field on any user. Manager: `name`/`designation` only, on subtree only. Self: `name`/`designation` only. |
| `GET /users/{id}/subordinates` | Direct + indirect reports (from closure table). | Session | Owner: any. Manager: self only. |

---

## 3. Hierarchy & Permissions (Owner configuration surface)

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /hierarchy` | **Flat list** of nodes `{id, employee_code, name, role, manager_id}` (build the tree client-side from `manager_id`), sorted by name. Optional `root_user_id` (Owner only; ignored for Managers) restricts it to that user's subtree, root included. | Session | Owner: full tree. Manager: own subtree. |
| `PATCH /hierarchy/{user_id}/manager` | Reassign a user's direct manager. Body `{manager_id}`. Triggers closure table recompute + audit log. | Session | Owner only. |
| `GET /permissions/me` | The **caller's own** permission configuration for permission-aware UI: `{role, unrestricted (Owner), role_defaults: [{permission_key, allow}], grants: [{permission_key, scope_type, scope_id, effect, expires_at}]}` (active grants only). Display hint only; the server enforces everything regardless. | Session | Any logged-in user (own data only). |
| `GET /permissions/definitions` | List available permission keys/descriptions. | Session | **Owner only** (`403` for everyone else). There is no endpoint that returns the caller's own effective permissions — see §22. |
| `GET /permissions/grants` | List active grants. Filters: `grantee_user_id`, `permission_key`, `scope_type`. | Session | Owner only. |
| `POST /permissions/grants` | Create a grant/override. Body `{grantee_user_id, permission_key, scope_type, scope_id, effect, expires_at?}`. | Session | Owner only. |
| `DELETE /permissions/grants/{id}` | Soft-revoke a grant (`revoked_at`). | Session | Owner only. |

**Manager-visibility grants (enforced).** Three catalogued permissions change what a Manager may *read*, using `scope_type=user, scope_id=<manager B>` grants:

| Permission | Effect of an `allow` scoped to B | Where it applies |
|---|---|---|
| `view_manager_team` | Manager A can see B **and B's whole branch** as users | `GET /users`, `/users/{id}`, `/users/{id}/subordinates`, `GET /hierarchy` |
| `view_manager_reports` | A can see the EOD reports, tasks and attendance of B's whole branch | `GET /tasks` (+`/{id}`, `/history`), `/eod`, `/attendance` (+events), `/reports/tasks`, `/reports/attendance`, `/reports/workload` |
| `view_subordinate_manager_calendar` | A's team calendar includes/excludes B's branch | `GET /calendar` (the underlying tasks/leave rows must also be readable) |

An explicit `deny` scoped to U removes U **and U's branch** for that kind even from the grantee's own reporting subtree (the Owner's carve-out), and deny beats allow. A Manager always sees themself. Grants are read-only: viewing a peer's data never allows editing it (writes keep the plain reporting-hierarchy rule). Leave and service-management visibility are unchanged (reporting hierarchy / assignment based). Revoked and expired grants have no effect. The rules are evaluated inside PostgreSQL (`app_visible_user_ids`, migration `0016`), so the API and row-level security cannot disagree.

---

## 4. Tasks

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `GET /tasks` | Filters: `assigned_to`, `project_id`, `status`, `task_date` (exact date; for ranges use `GET /calendar`). Sorted `task_date` desc (nulls last), then `created_at` desc. | Session | Owner: all. Manager: own + subtree's. Employee: own only. |
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
| `GET /leaves` | Filters: `employee_id`, `status` (no date filter; for date ranges use `GET /calendar`, which includes leave). Sorted newest first. | Session | Owner: all. Manager: own + subtree's. Employee: own only. |
| `GET /leaves/{id}` | Detail incl. approval history. | Session | Same scoping. |
| `POST /leaves/{id}/approve` | Body `{comments?}`. Only valid if caller is `current_approver_id` or Owner, and the request is still `pending`. Implemented as single-level: one approval finalizes `status=approved` (the schema's `leave_approvals.sequence` supports a multi-step chain, not built — see Open Questions). | Session | `current_approver_id` or Owner. |
| `POST /leaves/{id}/reject` | Body `{comments}` (required — reason for rejection). | Session | `current_approver_id` or Owner. |
| `POST /leaves/{id}/cancel` | Employee withdraws a still-pending request. | Session | The requesting employee only, while `status=pending`. |

---

## 7. EOD Reports

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `POST /eod` | Submit EOD. Body `{report_date, project_id?, task_id?, work_completed, work_remaining, issues?, notes?}`. | Session | Self. |
| `GET /eod` | Filters: `user_id`, `project_id`, `report_date` (exact date). Sorted `report_date` desc. | Session | Owner: all. Manager: own + subtree's (including subordinate Managers', per §5.4). Employee: own only. |
| `GET /eod/{id}` | Detail. Attachments are fetched separately via `GET /attachments?entity_type=eod_report&entity_id=` (§15), not embedded. | Session | Same scoping. |

---

## 8. Attendance

| Method & Path | Description | Auth | Permission |
|---|---|---|---|
| `POST /attendance/punch-in` | Body `{latitude?, longitude?}` (both optional; requested only at this moment, not polled). Creates an `attendance_events` row and upserts today's `attendance_days` row. `409` if already punched in today, or if today's in/out cycle is already complete (each day is one punch-in/punch-out pair — see Attendance note below). `work_date` is the calendar date of the event in the **company timezone** (Asia/Kolkata / IST; the day rolls over at 00:00 IST, not 00:00 UTC). Timestamps in responses stay UTC instants — display them in the company timezone (`GET /config`). | Session | Self only — `user_id` is always the authenticated caller, never a request field. |
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
| `GET /notifications` | Current user's notifications, filter `unread_only`; each item is `{id, recipient_user_id, type, payload, read_at, created_at}`. `type` and `payload` are free-form until producers exist — render them generically and do not build deep links from an assumed `payload` shape. | Session | Self. |
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

Search is implemented as filter parameters on the relevant list endpoints, rather than a separate unified search endpoint, keeping permission scoping identical to the underlying resource's list rule. All text filters are case-insensitive **partial** matches: `GET /users?search=` (name, employee_code, designation), `GET /customers?name=|customer_code=|contact=|machine_serial=` (contact matches contact name, phone or email), `GET /machines?serial_number=|model_name=`, `GET /service-calls?service_call_code=`. There is no `?search=` on customers/machines and no `GET /search`; a cross-entity endpoint may be added later purely as a UI affordance that fans out to the same scoped queries — not a new authorization surface.

---

## 20. Enums Reference

Every value below is also published as an `enum` on the corresponding fields in `docs/openapi.json` (so generated TypeScript types carry the unions; `tests/test_openapi_enums.py` keeps this table and the OpenAPI document in agreement). Every value below is enforced server-side with a Postgres `CHECK` constraint (see `backend/alembic/versions/`, constraint names `ck_*_valid`) — these are the exhaustive, authoritative value sets, not just current usage. Useful directly for frontend dropdowns, status badges, and filter controls without cross-referencing migration files.

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

## 21. List Behaviour: Shapes, Sorting, Pagination

Paging is `?page=` (≥ 1, default 1) and `?page_size=` (1–100, default 25); out-of-range values are `422`. Paginated lists use `LIMIT/OFFSET`; `total` is the full match count. Every list is ordered deterministically (below); there is no client-selectable sort on any endpoint.

| Shape | Endpoints (sort order) |
|---|---|
| **Paginated** `{items, total, page, page_size}` | `GET /users` (name) · `/tasks` (task_date desc, nulls last, then created_at desc) · `/projects` (created_at desc) · `/leaves` (created_at desc) · `/eod` (report_date desc) · `/attendance` (work_date desc) · `/customers` (name) · `/machines` (machine_code) · `/service-calls` (created_at desc) · `/audit-logs` (created_at desc) |
| `{items}` only (not paginated) | `GET /calendar` (bounded by the required `start_date`..`end_date`) · `GET /attachments` (requires `entity_type`+`entity_id`; newest first) |
| `{items, total}` (not paginated) | `GET /notifications` (newest first; `?unread_only=true`) |
| **Bare JSON array** | `GET /hierarchy` · `/users/{id}/subordinates` · `/permissions/definitions` · `/permissions/grants` · `/tasks/{id}/history` · `/projects/{id}/members` · `/attendance/{user_id}/{work_date}/events` · `/customers/{id}/contacts` · `/service-calls/{id}/assignments` · `/visits` · `/reports` (sub-resource) · `/reports/attendance` · `/reports/workload` |
| Aggregates | `GET /reports/tasks` → `{by_status, total}` · `/reports/leave` → `{by_status, total}` · `/reports/service-activity` → `{by_status, total_calls, average_resolution_minutes}` |

Unbounded-by-design lists to be aware of: `/hierarchy` (Owner: every user), `/permissions/*`, `/reports/attendance` and `/reports/workload` (one row per in-scope user; use `start_date`/`end_date` on attendance). Fine at current scale; the frontend should not assume they stay small.

---

## 22. Frontend Integration Checklist

### Endpoints the frontend MUST use
- **Session:** `POST /auth/login` → `GET /auth/me` on every app start (the source of the caller's `role`, `id`, `manager_id`, `must_reset`) → `GET /permissions/me` for permission-aware UI → `POST /auth/refresh` on `401` (once, then retry) → `POST /auth/logout`. `POST /auth/change-password` is required UX: accounts created by the API or the seed script start with `must_reset: true` (returned by login and `/auth/me`) and are blocked from everything else until the password is changed.
- **Employee surface:** `/tasks` (+`PATCH` status), `/projects`, `/leaves`, `/eod`, `/attendance` (+`punch-in`/`punch-out`), `/service-calls` + `/visits` + `/reports`, `/attachments`, `/notifications`.
- **Manager adds:** `/users` (scoped), `/users/{id}/subordinates`, `POST /tasks`, project member endpoints, `POST /leaves/{id}/approve|reject`, `/calendar`, `/reports/*`, `/service-calls/{id}/assign`.
- **Owner adds:** `POST /users`, `PATCH /users/{id}`, `PATCH /hierarchy/{id}/manager`, `/permissions/*`, `/audit-logs`.

### Optional / future (do not build UI that depends on them)
- `GET /health`, `GET /health/db` (ops only). `GET /search` is **not implemented** (§19: per-resource filters only). No export/download-as-file endpoints exist except attachment download. No push/email/WhatsApp delivery. No multi-step leave approval. No self-service password recovery (admin reset only).

### Endpoints with special permission behaviour
- **Owner only (`403` otherwise):** `POST /users`, `PATCH /hierarchy/{id}/manager`, `GET /permissions/definitions`, all `/permissions/grants` calls, `GET /audit-logs`.
- **Manager or Owner (`403` for Employees):** all `GET /reports/*`.
- **Grant-gated (a Manager needs an explicit Owner grant):** archiving a project (`delete_archive_project`, even for the owning manager), editing a project they don't own (`modify_project`), adding project members (`assign_employees_to_project`), assigning a task to another Manager (`assign_tasks_to_manager`), assigning employees to a service call they are not responsible for (`assign_employees_to_service_call`). `create_project` is allowed to Managers by default.
- **Scope-dependent results:** most list/detail endpoints return different rows per role (Owner all, Manager self + subtree, Employee own/assigned). Never infer access from a row being absent — it may be out of scope.
- **`404` vs `403`:** see Conventions. Treat both as "not available to you".
- **Attachments:** `GET /attachments/{id}` returns a short-lived `download_url`; `GET /attachments/{id}/download` always streams through the API with the session cookie. Upload is `multipart/form-data` (`entity_type`, `entity_id`, `file`); the server rejects unknown extensions, files over 25 MB and content whose magic bytes don't match the extension (`422`).

### Behaviour worth knowing (previously audit gaps - all resolved 2026-10-09)
1. **Permission-aware UI:** use `GET /permissions/me` for the caller's role defaults and grants, plus `role` from `/auth/me`; still handle `403`/`404`, which are authoritative.
2. **Manager-visibility grants are enforced** (§3): the Owner's permission UI can offer them. A grant covers the target manager's whole branch; deny beats allow.
3. **Forced password change:** read `must_reset` from login or `/auth/me`; while true, route the user to a change-password screen (every other call returns `403 password_change_required`). Re-login after changing.
4. **Date-range filters** exist only on `/attendance`, `/calendar` and `/reports/attendance`; `/tasks` and `/eod` filter by one exact date, `/leaves` has none.
5. **Error `details`** are only on malformed-input `422`s, not on business-rule `422`s.
6. Text filters match literally (a typed `%` or `_` is not a wildcard).

### Frontend implementation checklist
- [ ] API client: `credentials: "include"`, JSON, echo `csrf_token` cookie as `X-CSRF-Token` on `POST/PATCH/DELETE`; on `401` try `/auth/refresh` once then redirect to login.
- [ ] One error handler over `{error:{code,message,details?}}`; map `details[].field` to form fields; treat `403`/`404` identically in the UI; show the request id from `internal_error` messages.
- [ ] Generic paginated-table component for the 10 paginated lists; separate simple-list handling for `{items}`, `{items,total}` and bare arrays (§21).
- [ ] Types generated from `docs/openapi.json` (now includes the real error schema); re-run `python -m scripts.contract_tools` after backend changes.
- [ ] Build the org tree from `/hierarchy`'s flat list. Resolve **names for any user id** (assigner, approver, reviewer, actor, responsible manager…) in batches with `GET /users/directory` (max 100 ids per call), cached per id — Employees cannot read other users' profiles.
- [ ] Respect `429` on login/refresh (back off) and the 5-failure account lock; handle `403 password_change_required` by sending the user to the change-password screen.
- [ ] Use dropdown values from §20 (the server rejects anything else with `422`).
- [ ] Remove the hardcoded demo-login buttons from `LoginPage.tsx` before any real deployment.

---

## Getting Started for Frontend Integration

1. **Get exact types first.** Run the backend once (`uvicorn app.main:app --reload` from `backend/`, after `pip install -r requirements.txt` and a `.env` with at least a `JWT_SECRET_KEY` — a real `DATABASE_URL` is not required for the server to start or for `/docs`/`/openapi.json` to work, only for endpoints that actually query the database) and feed `docs/openapi.json` (or the live `/openapi.json`) into your codegen tool of choice for request/response TypeScript types. Don't hand-transcribe shapes from this document.
2. **Auth flow:** `POST /auth/login` with `credentials: "include"` → cookies are set automatically → read the `csrf_token` cookie and send it back as `X-CSRF-Token` on every subsequent `POST`/`PATCH`/`DELETE`. No token ever needs to be stored in JS-accessible storage.
3. **Ten collection endpoints** share the envelope `{ items, total, page, page_size }` — build one generic paginated-table component for those. The other list endpoints differ (§21); do not assume one shape for every list.
4. **Every error response** follows `{ error: { code, message, details? } }` with a real HTTP status (401/403/404/409/422/429/500) — build one generic error handler around that shape and use `details` for per-field form errors.
5. **Run it locally:** start the API (`uvicorn app.main:app --reload` from `backend/`, with `DATABASE_URL`/`JWT_SECRET_KEY` in `backend/.env`), create the first Owner with `python -m scripts.seed_owner`, then log in. Note the test suite truncates the development database, so re-seed after running it.

---

## Open Questions Requiring a Business Decision

All four were implemented with a specific default rather than left blocking (see `docs/development-status.md` for the full list of such decisions across every phase); each remains easy to redirect if wrong.

1. Can Managers create new Employee users directly, or is user creation strictly Owner-only? **Implemented as Owner-only.**
2. Customer/machine visibility for Employees/Managers not explicitly assigned to a service call — is customer data company-wide-visible to all staff, or restricted to those with an active assignment/responsibility? **Implemented as a hybrid**: Owner/Manager see the full directory (needed to search and log new calls for anyone); Employees are assignment-scoped. Editing (not viewing) a customer/machine is narrower still — see §10.
3. Can an Employee view a teammate's service report on a call they're jointly assigned to, or only their own submitted report? **Implemented as own report only.**
4. Does the Owner submit/require their own EOD reports and attendance punches, or are those Employee/Manager-only concepts? **Implemented as optional** — nothing prevents the Owner from using `/eod`, `/leaves`, or `/attendance` for their own record.

## Appendix A — Operation reference (generated)

Generated from the running app by `python -m scripts.contract_tools`; do not edit by hand. It states, for every operation, the success status, the **route-level** role guard (`Session` means any logged-in user — finer scoping is the "Permission" column above, enforced in the service layer and by RLS), query parameters and request-body fields (`*` = required). Where this table and a hand-written `Body {...}` list disagree on which fields are required, this table wins.

<!-- BEGIN GENERATED OPERATION REFERENCE (python -m scripts.contract_tools) -->

| Method & path | OK | Auth (route-level) | Query params | Request body (* = required) | Response |
|---|---|---|---|---|---|
| `GET /health` | 200 | None | - | - | object |
| `GET /health/db` | 200 | None | - | - | object |
| `GET /config` | 200 | None | - | - | AppConfigResponse |
| `POST /auth/login` | 200 | None | - | employee_code*, password* | UserProfile |
| `POST /auth/refresh` | 200 | Refresh cookie | - | - | UserProfile |
| `POST /auth/logout` | 204 | Session | - | - | (empty) |
| `GET /auth/me` | 200 | Session | - | - | UserProfile |
| `POST /auth/change-password` | 204 | Session | - | current_password*, new_password* | (empty) |
| `GET /users` | 200 | Session | manager_id, role, is_active, search, page, page_size | - | UserListResponse |
| `POST /users` | 201 | Owner | - | employee_code*, name*, designation, role*, manager_id, initial_password* | UserResponse |
| `GET /users/directory` | 200 | Session | ids* | - | UserDirectoryEntry[] |
| `GET /users/{user_id}` | 200 | Session | - | - | UserResponse |
| `PATCH /users/{user_id}` | 200 | Session | - | name, designation, role, is_active | UserResponse |
| `GET /users/{user_id}/subordinates` | 200 | Session | - | - | UserResponse[] |
| `POST /users/{user_id}/reset-password` | 204 | Session | - | temporary_password* | (empty) |
| `GET /hierarchy` | 200 | Session | root_user_id | - | HierarchyNode[] |
| `PATCH /hierarchy/{user_id}/manager` | 200 | Owner | - | manager_id | HierarchyNode |
| `GET /permissions/me` | 200 | Session | - | - | MyPermissionsResponse |
| `GET /permissions/definitions` | 200 | Owner | - | - | PermissionDefinitionResponse[] |
| `GET /permissions/grants` | 200 | Owner | grantee_user_id, permission_key, scope_type | - | PermissionGrantResponse[] |
| `POST /permissions/grants` | 201 | Owner | - | grantee_user_id*, permission_key*, scope_type*, scope_id, effect*, expires_at | PermissionGrantResponse |
| `DELETE /permissions/grants/{grant_id}` | 204 | Owner | - | - | (empty) |
| `GET /tasks` | 200 | Session | assigned_to, project_id, status, task_date, page, page_size | - | TaskListResponse |
| `POST /tasks` | 201 | Session | - | title*, description, project_id, assigned_to*, priority, task_date, due_date | TaskResponse |
| `GET /tasks/{task_id}` | 200 | Session | - | - | TaskResponse |
| `PATCH /tasks/{task_id}` | 200 | Session | - | title, description, project_id, assigned_to, priority, status, task_date, due_date | TaskResponse |
| `GET /tasks/{task_id}/history` | 200 | Session | - | - | TaskHistoryEntry[] |
| `GET /projects` | 200 | Session | status, manager_id, member_id, page, page_size | - | ProjectListResponse |
| `POST /projects` | 201 | Session | - | name*, description, status, start_date, expected_end_date | ProjectResponse |
| `GET /projects/{project_id}` | 200 | Session | - | - | ProjectResponse |
| `PATCH /projects/{project_id}` | 200 | Session | - | name, description, status, start_date, expected_end_date, actual_end_date, is_active | ProjectResponse |
| `GET /projects/{project_id}/members` | 200 | Session | - | - | ProjectMemberResponse[] |
| `POST /projects/{project_id}/members` | 201 | Session | - | user_id*, role_in_project | ProjectMemberResponse |
| `DELETE /projects/{project_id}/members/{user_id}` | 204 | Session | - | - | (empty) |
| `POST /leaves` | 201 | Session | - | start_date*, end_date*, reason | LeaveResponse |
| `GET /leaves` | 200 | Session | employee_id, status, page, page_size | - | LeaveListResponse |
| `GET /leaves/{leave_id}` | 200 | Session | - | - | LeaveResponse |
| `POST /leaves/{leave_id}/approve` | 200 | Session | - | comments | LeaveResponse |
| `POST /leaves/{leave_id}/reject` | 200 | Session | - | comments* | LeaveResponse |
| `POST /leaves/{leave_id}/cancel` | 200 | Session | - | - | LeaveResponse |
| `POST /eod` | 201 | Session | - | report_date*, project_id, task_id, work_completed, work_remaining, issues, notes | EodResponse |
| `GET /eod` | 200 | Session | user_id, project_id, report_date, page, page_size | - | EodListResponse |
| `GET /eod/{eod_id}` | 200 | Session | - | - | EodResponse |
| `POST /attendance/punch-in` | 200 | Session | - | latitude, longitude | AttendanceDayResponse |
| `POST /attendance/punch-out` | 200 | Session | - | latitude, longitude | AttendanceDayResponse |
| `GET /attendance` | 200 | Session | user_id, manager_id, start_date, end_date, page, page_size | - | AttendanceListResponse |
| `GET /attendance/{user_id}/{work_date}/events` | 200 | Session | - | - | AttendanceEventResponse[] |
| `GET /calendar` | 200 | Session | start_date*, end_date*, user_id, project_id, team | - | CalendarResponse |
| `GET /customers` | 200 | Session | name, customer_code, contact, machine_serial, page, page_size | - | CustomerListResponse |
| `POST /customers` | 201 | Session | - | customer_code*, name*, address, notes | CustomerResponse |
| `GET /customers/{customer_id}` | 200 | Session | - | - | CustomerResponse |
| `PATCH /customers/{customer_id}` | 200 | Session | - | name, address, notes, is_active | CustomerResponse |
| `GET /customers/{customer_id}/contacts` | 200 | Session | - | - | CustomerContactResponse[] |
| `POST /customers/{customer_id}/contacts` | 201 | Session | - | name*, designation, phone, email, is_primary | CustomerContactResponse |
| `PATCH /customers/{customer_id}/contacts/{contact_id}` | 200 | Session | - | name, designation, phone, email, is_primary | CustomerContactResponse |
| `GET /machines` | 200 | Session | customer_id, serial_number, model_name, page, page_size | - | MachineListResponse |
| `POST /machines` | 201 | Session | - | customer_id*, machine_code*, model_name, serial_number, installation_date, purchase_info, warranty_info, location | MachineResponse |
| `GET /machines/{machine_id}` | 200 | Session | - | - | MachineResponse |
| `PATCH /machines/{machine_id}` | 200 | Session | - | model_name, serial_number, installation_date, purchase_info, warranty_info, location, status, is_active | MachineResponse |
| `GET /service-calls` | 200 | Session | customer_id, machine_id, employee_id, manager_id, status, service_call_code, page, page_size | - | ServiceCallListResponse |
| `POST /service-calls` | 201 | Session | - | service_call_code*, customer_id*, machine_id*, reported_by_contact_id, contacted_at*, contact_method*, issue_reported*, priority, service_type*, responsible_manager_id | ServiceCallResponse |
| `GET /service-calls/{service_call_id}` | 200 | Session | - | - | ServiceCallResponse |
| `PATCH /service-calls/{service_call_id}` | 200 | Session | - | issue_reported, priority, status, resolution, responsible_manager_id | ServiceCallResponse |
| `GET /service-calls/{service_call_id}/assignments` | 200 | Session | active_only | - | ServiceAssignmentResponse[] |
| `POST /service-calls/{service_call_id}/assign` | 201 | Session | - | employee_id*, role_in_call | ServiceAssignmentResponse |
| `DELETE /service-calls/{service_call_id}/assign/{assignment_id}` | 204 | Session | - | - | (empty) |
| `POST /service-calls/{service_call_id}/visits` | 201 | Session | - | visit_type*, visit_date, arrival_time, departure_time, latitude, longitude, work_performed, problem_found, parts_used, action_taken, result, customer_signoff | ServiceVisitResponse |
| `GET /service-calls/{service_call_id}/visits` | 200 | Session | - | - | ServiceVisitResponse[] |
| `PATCH /service-visits/{visit_id}` | 200 | Session | - | visit_date, arrival_time, departure_time, latitude, longitude, work_performed, problem_found, parts_used, action_taken, result, customer_signoff | ServiceVisitResponse |
| `POST /service-calls/{service_call_id}/report` | 201 | Session | - | service_visit_id, report_datetime, work_performed, problem_found, root_cause, action_taken, parts_used, result, pending_work, recommendations, employee_comments | ServiceReportResponse |
| `GET /service-calls/{service_call_id}/reports` | 200 | Session | - | - | ServiceReportResponse[] |
| `GET /service-reports/{report_id}` | 200 | Session | - | - | ServiceReportResponse |
| `POST /service-reports/{report_id}/review` | 200 | Session | - | comments | ServiceReportResponse |
| `GET /attachments` | 200 | Session | entity_type*, entity_id* | - | AttachmentListResponse |
| `POST /attachments` | 201 | Session | - | (multipart/form-data) entity_type*, entity_id*, file* | AttachmentWithUrlResponse |
| `GET /attachments/{attachment_id}` | 200 | Session | - | - | AttachmentWithUrlResponse |
| `DELETE /attachments/{attachment_id}` | 204 | Session | - | - | (empty) |
| `GET /attachments/{attachment_id}/download` | 200 | Session | - | - | (file stream; Content-Type is the stored file's) |
| `GET /audit-logs` | 200 | Owner | entity_type, entity_id, actor_user_id, action, start_date, end_date, page, page_size | - | AuditLogListResponse |
| `GET /notifications` | 200 | Session | unread_only | - | NotificationListResponse |
| `POST /notifications/{notification_id}/read` | 200 | Session | - | - | NotificationResponse |
| `POST /notifications/read-all` | 204 | Session | - | - | (empty) |
| `GET /reports/attendance` | 200 | Manager or Owner | start_date, end_date, manager_id | - | AttendanceReportRow[] |
| `GET /reports/tasks` | 200 | Manager or Owner | project_id | - | TaskReportResponse |
| `GET /reports/leave` | 200 | Manager or Owner | - | - | LeaveReportResponse |
| `GET /reports/workload` | 200 | Manager or Owner | - | - | WorkloadRow[] |
| `GET /reports/service-activity` | 200 | Manager or Owner | manager_id | - | ServiceActivityReportResponse |

<!-- END GENERATED OPERATION REFERENCE -->
