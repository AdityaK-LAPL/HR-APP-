# Development Status

Last updated: 2026-09-23

## Linux (Fedora) environment baseline — 2026-09-29

This section records the outcome of migrating this project to a new Fedora/Linux
development machine and establishing a Linux-native development baseline. It does
**not** change or re-verify any claim in the rest of this document below (those
phase statuses are unchanged and still describe the backend as "implemented, DB
verification pending"). It only records what was verified about the *environment
itself* on this machine.

**Git**: this project had no version control at all until this step (confirmed on
both this Fedora copy and the historical Windows source folder). Git was
initialized at the project root and an initial safety-checkpoint commit was made
containing the existing backend, frontend, and docs as-is. No secrets, `.env`
files, virtual environments, or `node_modules` were committed.

**Python/backend environment**: the repository's own `backend/.venv` was a
Windows-created virtual environment (Windows paths, `Scripts/` layout, Python
3.14) and could not be used on Linux. It was moved out of the project entirely
(preserved, not deleted) rather than overwritten. A genuine Linux-native venv
could **not** be created at the conventional `backend/.venv` path because
Python's `venv` module refuses to create an environment inside a path containing
a `:` character, which the parent directory
(`.../antigravity-ide:/HR APP Antigravity`) contains — this is a hard OS/Python
constraint (`:` is the POSIX `PATH` separator), not a project misconfiguration.
The real venv was created instead at `~/.venvs/hr-app-antigravity-backend`
(Linux Python 3.14.7, matching the version already targeted on Windows), with
`backend/.venv` kept as a symlink to it so existing tooling/docs referencing
`.venv/bin/activate` continue to work unchanged.

All dependencies from `requirements-dev.txt` (which includes `requirements.txt`)
were installed into that venv at the versions already pinned in those files — no
dependency was upgraded, added, or removed beyond what those files specify.
`fastapi`, `sqlalchemy`, `asyncpg`, `alembic`, `pydantic`, `pytest`,
`argon2-cffi`, and `pyjwt` all import successfully. `app.main` imports cleanly
and registers all 88 routes (no database connection is opened at import time).
`ruff check app tests` passes with no findings. Running `pytest` (with no
`DATABASE_URL` exported, so `tests/conftest.py`'s reachability check correctly
targets an unreachable local placeholder database rather than the real Supabase
project) produced **23 passed, 89 skipped, 0 failed** — the same DB-free/`
requires_db` split already documented elsewhere in this file. **The live
Supabase database was not connected to or modified in any way during this
step.**

**Frontend environment (completed 2026-09-29, follow-up step)**: Node.js 20.20.2
(the LTS line, matching Fedora 44's own `nodejs20` package version exactly) and
npm 10.8.2 were installed from the official upstream Node.js binary tarball
(sha256-verified against nodejs.org's published checksum), placed at
`~/.local/opt/node-v20.20.2-linux-x64` with `node`/`npm`/`npx` symlinked into
`~/.local/bin` (already on `PATH`) — no system package manager privileges were
available in this environment (`dnf install` requires root and interactive
`sudo` needs a password not obtainable non-interactively here), so a system
`dnf` install was not used; this was confirmed as the same official binary
`dnf` would have installed, not a third-party script.

`npm ci` (matching the existing `package-lock.json`) installed all 354 packages
cleanly with 0 vulnerabilities; the lockfile and `package.json` were not
modified. Running the project's actual lint (`oxlint`) and build
(`tsc -b && vite build`) commands directly (see note below) gave:

- **Lint**: PASS — 0 errors, 57 pre-existing warnings (unused imports/variables,
  a few React-hooks style suggestions). Not fixed, per this step's scope.
- **TypeScript (`tsc -b`)**: **FAILS** with 3 real, pre-existing type errors —
  `src/components/ui/Card.tsx` (`CardProps.title` incompatible with
  `HTMLAttributes<HTMLDivElement>`'s `title: string | undefined`), `src/main.tsx`
  (an import path ending in `.tsx` without `allowImportingTsExtensions`), and
  `src/pages/auth/LoginPage.tsx` (a duplicate `minHeight` key in one object
  literal, line 61 — also flagged separately by oxlint as `no-dupe-keys`). None
  of these were fixed, per this step's scope — see "Problems Discovered" below.
- **Vite build + PWA plugin**: PASS when run independently of `tsc` — `vite
  build` alone produces a working `dist/` with `manifest.webmanifest`, `sw.js`,
  and the Workbox precache correctly generated. Because the project's actual
  `build` script is `tsc -b && vite build`, the combined script would stop at
  the `tsc` failure before reaching `vite build`; the two were verified
  separately here specifically to isolate that the bundler/PWA pipeline itself
  is sound and the blocker is purely the 3 TypeScript errors above.

Note on invocation: `npm run lint`/`npm run build` themselves cannot be used
via their normal names in this project's location — `npm` scripts work by
prepending `node_modules/.bin` to `PATH`, and this project's own path contains a
literal `:` (the same character discussed above for the Python venv), which
silently truncates `PATH` at that character and makes every locally-installed
binary (`oxlint`, `tsc`, `vite`, and by extension any other CLI added later)
unresolvable via bare-name/`PATH` lookup — even though the binaries are present
and executable. The exact same underlying commands were instead invoked by
their file path directly (`./node_modules/.bin/oxlint`, `./node_modules/.bin/tsc
-b`, `./node_modules/.bin/vite build`), which are unaffected since they bypass
`PATH` resolution entirely. **This is a structural, ongoing risk beyond just
this one check** — any future `npm run <script>`, git hook, or editor
integration that relies on `PATH`-based local-binary resolution will silently
fail the same way in this exact project location, for as long as its parent
directory name contains a `:`.

**Explicitly not done in this step** (by design, deferred to later controlled
steps): reconciling migration `0011`, connecting to or verifying the live
Supabase schema/RLS, running the 89 `requires_db` backend tests against a real
database, installing Node.js / running any frontend build or typecheck, and any
frontend or backend feature/bug work.

Phase 1 is complete and fully verified. Phases 2 through 7 are fully implemented but **not yet run against a real PostgreSQL database** — this environment still has no reachable Postgres. Per the user's explicit direction, each phase was built on top of the previous unverified phase rather than waiting; all now share the same "implemented, DB verification pending" status and will be verified together in one pass once a database is available. Everything that *can* be verified without a database (imports cleanly, all 88 routes wire up, lints clean, and 21 pure unit tests — the original 11, 6 for local attachment storage, and 4 for the new rate limiter) has been verified after every change.

Phase 7 is also where the promised "reconcile `api-contract.md` against actual implemented endpoints" pass happened, and it found three real, previously-undetected gaps between what was documented back in Phase 0 and what actually got built — see the reconciliation section below. All three are now fixed.

### Phase 0 — Design & Documentation (complete)

- [x] Read and fully analyzed `context.md` (all 37 sections).
- [x] Authored `docs/architecture.md`, `docs/database.md`, `docs/permissions.md`, `docs/api-contract.md`.
- [x] Approved by the user.

### Phase 1 — Foundation

- [x] Backend project structure created at `backend/` (see `backend/README.md` for the layout and how to run it).
- [x] `requirements.txt` / `requirements-dev.txt` — FastAPI, SQLAlchemy (async) + asyncpg, Alembic, Argon2, PyJWT, pytest/httpx.
- [x] `app/core/config.py` — pydantic-settings configuration read from environment variables / `.env`; `.env.example` documents every required variable, no real secrets committed.
- [x] `app/core/logging.py` — structured logging with a per-request correlation id.
- [x] `app/core/errors.py` — application exception hierarchy (`AppError` and subclasses) and FastAPI handlers producing a single consistent `{"error": {"code","message"}}` shape; unhandled exceptions are logged server-side with the request id and never leak internals to the client.
- [x] `app/middleware.py` — request-id + access-log middleware.
- [x] `app/db/base.py` — SQLAlchemy declarative base with a fixed constraint-naming convention (for predictable Alembic autogenerate output).
- [x] `app/db/session.py` — async engine/session factory, `get_db` FastAPI dependency, `set_rls_context()` helper reserved for Phase 2's auth dependency to set the `app.user_id`/`app.user_role` GUCs that RLS policies will read (see `docs/permissions.md` §6).
- [x] `app/main.py` — FastAPI app factory: CORS restricted to configured origins, exception handlers registered, `/api/v1` router mounted, docs disabled in production.
- [x] `app/api/v1/endpoints/health.py` — unauthenticated `/health` and `/health/db` endpoints.
- [x] Alembic wired up (`alembic.ini`, `alembic/env.py` using the async-engine pattern, reading the DB URL from the same `Settings` object the app uses — one source of truth, no separate sync connection string). No migrations exist yet (no models yet); the first migration lands in Phase 2 with the identity/hierarchy/permission tables.
- [x] `tests/conftest.py` + `tests/test_health.py` — first tests (health check, standard error shape on an unknown route). Executed: both pass.
- [x] **Verified end-to-end**: created `.venv`, installed all dependencies, ran the dev server and confirmed `GET /api/v1/health` returns 200 and `GET /api/v1/health/db` correctly returns 503 with the standard error shape when no database is reachable (no real Postgres is configured yet — that response is the correct behavior, not a bug). Ran `pytest` (2 passed) and `ruff check` (clean).

#### Environment notes (Python 3.14 on Windows)

- Python 3.14.7 was installed via the user's own method (not winget, per their choice). Only a Windows-Store stub `python.exe` existed before that.
- `asyncpg` had to be bumped from `>=0.29,<0.30` to `>=0.30,<0.32` — 0.29 has no prebuilt wheel for `cp314` on Windows and pip tried to compile it from source, which failed without MSVC Build Tools. 0.31.0 ships a `cp314-win_amd64` wheel, so no compiler is needed.
- `pytest-asyncio` was bumped from `0.23.x` to `>=1.0,<2.0` to drop a page of `asyncio.get_event_loop_policy`-related `DeprecationWarning`s that 0.23 triggers under Python 3.14. `asyncio_mode = "auto"` in `pyproject.toml` still applies to 1.x.
- **Bug found and fixed during verification**: `app/core/config.py`'s `cors_allowed_origins: list[str]` field crashed on startup (`SettingsError` / `JSONDecodeError`) because pydantic-settings tries to `json.loads()` any list-typed field read from `.env` *before* a custom `field_validator(mode="before")` ever runs. Fixed by annotating the field `Annotated[list[str], NoDecode]` (from `pydantic_settings`) so the raw comma-separated string reaches the validator unparsed. Anyone adding another list/dict-typed setting later needs the same annotation, not just a validator.

### Phase 2 — Authentication, Users, Hierarchy, Permissions

**Models & migrations**
- [x] `app/models/identity.py` (`User`, `UserCredentials`, `Session`, `ManagerHierarchyClosure`), `app/models/permission.py` (`PermissionDefinition`, `RolePermission`, `PermissionGrant`), `app/models/audit.py` (`AuditLog`), `app/models/mixins.py` (UUID PK + timestamp mixins).
- [x] `alembic/versions/0001_identity_permissions_audit.py` — hand-written table DDL (no live DB to autogenerate against — see verification note below).
- [x] `alembic/versions/0002_hierarchy_triggers_rls_seed.py` — hand-written: `updated_at` trigger, RLS helper functions (`current_app_user_id()`/`current_app_user_role()`), manager-hierarchy closure-table maintenance trigger (`sync_manager_hierarchy_closure`) and cycle-prevention trigger (`prevent_manager_hierarchy_cycle`), audit-log immutability trigger, RLS policies + `FORCE ROW LEVEL SECURITY` on all 8 Phase 2 tables, and the `permission_definitions`/`role_permissions` catalog seed data.

**Security & auth**
- [x] `app/core/security.py` — Argon2id password hashing, JWT access tokens, opaque SHA-256-hashed refresh tokens, CSRF tokens, password-strength validation.
- [x] `app/core/cookies.py` — cookie set/clear helpers (`access_token` path `/`, `refresh_token` path `/api/v1/auth`, non-httpOnly `csrf_token`).
- [x] `app/api/deps.py` — `get_current_user`: validates the access-token JWT, re-reads the user from the DB (never trusts the token's role claim beyond bootstrapping — re-sets RLS context from the DB row if the role has changed since token issue), sets the PostgreSQL RLS GUCs for the rest of the request, and enforces the CSRF double-submit check on mutating requests. `require_role`/`require_owner`/`require_manager_or_owner` helpers.
- [x] `app/services/auth_service.py` — login (with account lockout after 5 failed attempts, generic error message, dummy-hash timing padding for unknown employee codes), refresh (rotates the refresh token every use), logout, self-service change-password, admin `reset-password` (Owner: any user; Manager: subtree only) — all via the `'system'` RLS-bootstrap role, never a real end-user role, for the necessarily-unauthenticated login/refresh lookups.

**Business logic & permission evaluator**
- [x] `app/services/permission_service.py` — `in_scope()` (the default hierarchy rule: owner sees all, self, manager sees subtree) and `has_permission()` (full deny > allow > hierarchy > role-default evaluation per `permissions.md` §5).
- [x] `app/services/user_service.py`, `app/services/hierarchy_service.py` (manager reassignment — the only code path that changes `manager_id`, deliberately kept out of generic user updates), `app/services/permission_grant_service.py` (Owner-only grant CRUD), `app/services/audit_service.py` (generic audit writer used by all of the above).

**Endpoints** (all wired into `app/api/v1/router.py`)
- [x] `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/change-password`.
- [x] `/users` (list/create), `/users/{id}` (get/patch), `/users/{id}/subordinates`, `/users/{id}/reset-password`.
- [x] `/hierarchy` (get, scoped), `/hierarchy/{user_id}/manager` (PATCH, Owner-only).
- [x] `/permissions/definitions`, `/permissions/grants` (list/create/revoke, Owner-only).

**Tests**
- [x] `tests/test_security_utils.py` — 11 pure unit tests, **executed, all pass**: password hashing round-trip/salting, password-strength validation, JWT round-trip/tamper-rejection/wrong-type-rejection, refresh-token entropy/uniqueness, CSRF token uniqueness.
- [x] `tests/test_auth_flow.py` — 12 end-to-end HTTP tests: login success/failure/lockout, generic error on unknown employee code, `/me` auth requirement, CSRF rejection on mutating requests without the header, change-password revoking sessions, logout revoking the session, refresh rotation, Owner and in-subtree-Manager password resets, out-of-subtree Manager reset correctly rejected (403).
- [x] `tests/test_hierarchy_and_permissions.py` — 13 tests covering the required business-rule scenarios: closure-table correctness on creation and on manager reassignment (including moving a whole subtree), cycle prevention, `in_scope()` for owner/self/manager-subtree/outside-subtree, an employee unable to read another employee's record, the manager role-default (`create_project`) working with no grant needed, cross-manager visibility correctly denied by default and unlocked by an Owner `allow` grant, an explicit `deny` grant overriding the hierarchy default, and a revoked grant no longer applying.
- [ ] **Not yet executed**: all 25 of the above DB-dependent tests are marked `requires_db` and currently **skip** (confirmed: they skip cleanly, not error) because no PostgreSQL is reachable in this environment — see the verification note immediately below.

#### Phase 2 verification note — what is proven vs. not

Proven right now, in this environment:
- The full Phase 2 codebase imports without error and every endpoint registers on the FastAPI router (checked by importing `app.main:app` and listing routes).
- `ruff check` is clean across `app/` and `tests/`.
- The 11 database-free unit tests pass, covering all of the cryptographic/token logic in isolation.

**Not yet proven** — needs a real PostgreSQL database, which this environment does not have (the user chose "proceed without one for now" when asked):
- That the two hand-written Alembic migrations actually apply cleanly (`alembic upgrade head`).
- That the hierarchy-closure-table trigger and the cycle-prevention trigger behave correctly against a real database (the logic has been reasoned through carefully and is the standard closure-table re-parenting algorithm, but has not been executed).
- That the RLS policies actually enforce the intended access boundaries end-to-end (they are logically consistent with the service-layer checks by construction, but untested against a live Postgres instance).
- That the 24 DB-dependent tests in `test_auth_flow.py` and `test_hierarchy_and_permissions.py` actually pass, as opposed to merely being well-formed and correctly skipping.

**Before Phase 2 can be called done**, point `DATABASE_URL` at a real (disposable) Postgres database, run `alembic upgrade head`, then `pytest`, and fix anything that surfaces — exactly the same pattern Phase 1 followed once Python became available. This is the top priority next action.

### Phase 3 — Tasks, Projects, Leave, EOD

**Models & migrations**
- [x] `app/models/task.py` (`Task`, `TaskHistory`), `app/models/project.py` (`Project`, `ProjectMember`), `app/models/leave.py` (`LeaveRequest`, `LeaveApproval`), `app/models/eod.py` (`EodReport`).
- [x] `alembic/versions/0003_tasks_projects_leave_eod.py` — hand-written table DDL (`projects` created before `tasks` since `tasks.project_id` references it; `project_members` has a **partial** unique index on `(project_id, user_id) WHERE is_active`, not a blanket unique constraint, so a removed-then-re-added member doesn't collide with their own history).
- [x] `alembic/versions/0004_phase3_triggers_and_rls.py` — two reusable SQL predicate functions, `current_app_in_scope(target)` and `current_app_can_access(permission_key, scope_type, scope_id)`, that mirror `app/services/permission_service.py`'s `in_scope()`/`has_permission()` exactly, so every Phase 3 RLS policy is built from them instead of duplicating the hierarchy/grants logic per table; `updated_at` triggers on `projects`/`tasks`/`leave_requests`; RLS + `FORCE ROW LEVEL SECURITY` on all 7 Phase 3 tables (`task_history` and `leave_approvals` are append-only — no `UPDATE`/`DELETE` policy exists for them, so both default-deny).

**Business logic**
- [x] `app/services/task_service.py` — creation permission mirrors `docs/permissions.md` (self/subtree always allowed; a manager can only reach another manager via an `assign_tasks_to_manager` grant); every mutating update writes per-field `task_history` rows plus `audit_logs` entries for `task.created`/`task.reassigned`/`task.status_changed`; an employee who isn't otherwise a manager of the task can update `status` only — any other field in the same request is rejected.
- [x] `app/services/project_service.py` — `create_project` uses the `create_project` role-default grant (seeded `true` for managers in migration `0002`); ordinary edits are allowed for the project's own owning manager or a `modify_project` grant; **archiving (`is_active=false`) is authorized separately** via `delete_archive_project`, required even for the project's own owning manager, per context.md section 8's explicit "Owner controls whether Manager can delete/archive" language — this is a deliberate deviation from "ownership implies full edit rights" and is called out in `api-contract.md`.
- [x] `app/services/leave_service.py` — single-level approval (the employee's direct manager becomes `current_approver_id`; one decision finalizes the request), with the schema left ready for a multi-step chain later (open question 3, still unresolved). A user with no manager (only possible for the Owner) is auto-approved, since there's no one above them to decide.
- [x] `app/services/eod_service.py` — submit/list/get only; no update endpoint exists, matching context.md's "maintain historical EOD reports."
- [x] `app/services/hierarchy_service.py`'s `reassign_manager` now also catches the DB-level cycle-prevention trigger's exception and translates it into the same `ValidationFailedError` the pre-check already raises, so a race between the pre-check and the trigger still surfaces a clean 422 rather than a raw DB error.

**Endpoints** (wired into `app/api/v1/router.py`)
- [x] `/tasks` (list/create), `/tasks/{id}` (get/patch), `/tasks/{id}/history`.
- [x] `/projects` (list/create), `/projects/{id}` (get/patch), `/projects/{id}/members` (list/add), `/projects/{id}/members/{user_id}` (remove).
- [x] `/leaves` (apply/list), `/leaves/{id}` (get), `/leaves/{id}/approve`, `/leaves/{id}/reject`, `/leaves/{id}/cancel`.
- [x] `/eod` (submit/list), `/eod/{id}` (get).

**Tests** (all `requires_db`, written and confirmed to skip cleanly, not yet executed — see verification note below)
- [x] `tests/test_tasks.py` — 7 tests: employee cannot create a task, manager can assign within their subtree, manager cannot assign outside it without a grant, manager can assign to another manager once granted `assign_tasks_to_manager`, an employee can update only `status` on their own task (any other field is rejected), `task_history` records exactly the fields that changed, an employee cannot view a task assigned to a different employee.
- [x] `tests/test_projects.py` — 7 tests: manager can create a project via the role default, employee cannot, a non-owning manager is rejected without a grant, an Owner `modify_project` grant unlocks editing for a non-owning manager, archiving is rejected for the owning manager without `delete_archive_project` and succeeds once granted, members can be added and removed, a project member can view but not modify the project.
- [x] `tests/test_leave_and_eod.py` — 9 tests: applying sets the direct manager as `current_approver_id`, that manager can approve, an unrelated manager cannot, rejecting without `comments` is a 422 and with `comments` succeeds, an employee can cancel their own pending request but not one already decided, an Owner's own leave auto-approves, EOD submission plus manager visibility into a subordinate's report, and an employee cannot view another employee's EOD report.

#### Phase 3 verification note — what is proven vs. not

Same situation as Phase 2, restated for the additional surface area: the full codebase (now ~60 routes) imports cleanly, `ruff check` is clean, and the existing 11 DB-free unit tests still pass unaffected. The two new migrations, the two new RLS helper functions, every Phase 3 RLS policy, and all 23 new `requires_db` tests are written but **not executed against a real database**. Once one is available, `alembic upgrade head` then `pytest` covers Phases 2 and 3 together in a single pass (47 tests currently skip; all should go green, or surface real bugs to fix — either outcome is useful information, and either is expected at this stage).

### Phase 4 — Attendance

**Models & migrations**
- [x] `app/models/attendance.py` (`AttendanceEvent`, `AttendanceDay`).
- [x] `alembic/versions/0005_attendance.py` — hand-written table DDL: `attendance_events` (the raw punch log) and `attendance_days` (the derived per-user-per-day summary, unique on `(user_id, work_date)`, plus a plain index on `work_date` for company-wide date-range reports).
- [x] `alembic/versions/0006_attendance_rls.py` — RLS + `FORCE ROW LEVEL SECURITY` on both tables, reusing the `current_app_in_scope()` helper from migration `0004` rather than duplicating the hierarchy check a third time.

**Business logic**
- [x] `app/services/attendance_service.py` — `punch_in`/`punch_out` always act on the authenticated caller (`user_id` is never taken from the request body); each day is exactly one punch-in/punch-out pair, so a second punch-in after already completing a cycle is rejected (`409`), not merged — the raw event log itself has no such limit, so a future multi-session/"breaks" feature can extend the service layer alone. Location (`latitude`/`longitude`) is optional per punch and captured only at that instant, never polled. `work_date` is the UTC calendar date of the event, since no company timezone has been confirmed (open question 7, still open).

**Endpoints** (wired into `app/api/v1/router.py`)
- [x] `POST /attendance/punch-in`, `POST /attendance/punch-out`.
- [x] `GET /attendance` (paginated `attendance_days`, filters `user_id`/`manager_id`/`start_date`/`end_date` — no `project_id` filter, since attendance isn't linked to projects in this schema; documented as a deliberate scope reduction in `api-contract.md`).
- [x] `GET /attendance/{user_id}/{work_date}/events` (raw punch log for one user-day).

**Tests** (`requires_db`, written and confirmed to skip cleanly, not yet executed)
- [x] `tests/test_attendance.py` — 10 tests: punch-in creates today's summary row with the formatted location, punching in without coordinates is allowed, double punch-in and punch-out-before-punch-in and double punch-out and re-punch-in-after-a-completed-cycle are all rejected with `409`, punch-out computes `total_duration_minutes`, a manager can list their subtree's attendance and cannot see a stranger's, and an employee cannot view another employee's punch events.

#### Phase 4 verification note — what is proven vs. not

Same situation as Phases 2-3: the full codebase (48 routes) imports cleanly, `ruff check` is clean, and the 11 DB-free unit tests still pass unaffected. The two new migrations, the RLS policies, and all 10 new `requires_db` tests are written but **not executed against a real database** — 57 tests now skip cleanly pending that. `alembic upgrade head` then `pytest` will cover Phases 2, 3, and 4 together in a single pass once a database is available.

### Phase 5 — Service Management

**Models & migrations**
- [x] `app/models/customer.py` (`Customer`, `CustomerContact`), `app/models/machine.py` (`Machine`), `app/models/service.py` (`ServiceCall`, `ServiceAssignment`, `ServiceVisit`, `ServiceReport`).
- [x] `alembic/versions/0007_service_management.py` — hand-written DDL for all 7 tables, in FK-dependency order (`customers` → `customer_contacts`/`machines` → `service_calls` → `service_assignments`/`service_visits` → `service_reports`).
- [x] `alembic/versions/0008_service_management_rls.py` — `updated_at` triggers on `customers`/`machines`/`service_calls`; RLS + `FORCE ROW LEVEL SECURITY` on all 7 tables, reusing the `current_app_in_scope()`/`current_app_can_access()` helpers from migration `0004`.
- [x] **Schema addition beyond the original design**: `customers.created_by` and `machines.created_by` (nullable FK → users), added because edit-authorization needs something to derive scope from before any service call exists for a brand-new customer/machine — see the Open Question 2 resolution below.

**Business logic — the Open Question 2 & 3 resolutions**
- [x] `app/services/customer_service.py`, `app/services/machine_service.py` — **resolved Open Question 2**: Owner and any Manager can view and create any customer/machine (they need to search the full directory to log a new call for someone they've never touched before); Employees are scoped to customers/machines reachable via an active service assignment. *Editing* is narrower than viewing: Owner any; Manager only if they created the record or have an in-scope service call referencing it. Deactivating either (`is_active=false`) is Owner-only regardless.
- [x] `app/services/service_call_service.py` — creation limited to Owner/Manager; `responsible_manager_id` defaults to the creating Manager (a Manager may only name themselves or a subtree manager, never arbitrarily); reassigning `responsible_manager_id` after creation is a new, Owner-only capability the original design didn't have a path for. Field-level PATCH authorization follows the same "manager-in-scope: any field; assigned employee: `status` only" pattern established for tasks/service calls in Phase 3. Reassigning employees deactivates the prior `service_assignments` row rather than overwriting it, preserving history (context.md §18).
- [x] `app/services/service_visit_service.py`, `app/services/service_report_service.py` — **resolved Open Question 3**: an Employee sees only their own submitted report(s) on a call, never a teammate's, even when jointly assigned.
- [x] Cross-module sharing: `fetch_call`/`can_manage_call`/`can_view_call`/`is_assigned_to_call` in `service_call_service.py` are deliberately not underscore-prefixed, since `service_visit_service.py` and `service_report_service.py` import them directly — this is this domain's internal API across three closely related modules, not a public HTTP-facing surface.
- [x] Audit actions added: `service_call.created`, `service_call.status_changed`, `service_call.employee_assigned`, `service_report.submitted` — matching context.md §24's explicit list exactly (no audit noise for every field edit, consistent with the Phase 3 pattern).

**Endpoints** (wired into `app/api/v1/router.py`)
- [x] `/customers` (list/create), `/customers/{id}` (get/patch), `/customers/{id}/contacts` (list/add), `/customers/{id}/contacts/{contact_id}` (patch) — the `GET .../contacts` list endpoint was **not in the original design sketch**; added because there was otherwise no way to retrieve a customer's contacts at all, only add/edit one blind.
- [x] `/machines` (list/create), `/machines/{id}` (get/patch).
- [x] `/service-calls` (list/create), `/service-calls/{id}` (get/patch), `/service-calls/{id}/assign` (assign), `/service-calls/{id}/assign/{assignment_id}` (unassign), `/service-calls/{id}/visits` (list/create), `/service-visits/{id}` (patch), `/service-calls/{id}/report` (submit), `/service-calls/{id}/reports` (list), `/service-reports/{id}` (get), `/service-reports/{id}/review`.
- [x] **No separate `/reports/customer/{id}/history` or `/reports/machine/{id}/history` endpoint was built.** Service history (context.md §23: Customer → Machines → Service Calls → Reports) is reached by chaining `GET /machines?customer_id=`, `GET /service-calls?customer_id=` or `?machine_id=`, and `GET /service-calls/{id}/reports` — all already correctly scoped. Building a parallel aggregate endpoint would mean a second, divergence-prone copy of the same authorization logic; a pure server-side-join convenience endpoint remains possible in Phase 6 without adding a new authorization surface.

**Tests** (`requires_db`, written and confirmed to skip cleanly, not yet executed)
- [x] `tests/test_customers_and_machines.py` — 7 tests: a Manager sees all customers (not just ones they created), an Employee cannot view an unassigned customer but can once actively assigned to a service call for it, only the creating Manager or a scoped Manager can edit a customer (an unrelated Manager gets 403), only the Owner can deactivate a customer, a machine requires a valid `customer_id`, and deactivating a machine preserves its service call history (queryable exactly as before).
- [x] `tests/test_service_calls.py` — 8 tests: an Employee cannot create a service call, a Manager creating one becomes `responsible_manager_id` by default, an unrelated Manager cannot view a call outside their scope, assigning/unassigning an employee preserves the assignment history (a new assignment row on reassignment, not a mutated one), an assigned Employee can update only `status`, the full visit → report → review workflow, an employee not assigned to a call cannot submit a report for it, and an Employee sees only their own report on a call while the responsible Manager sees all of them.

#### Phase 5 verification note — what is proven vs. not

Same situation as Phases 2-4: the full codebase (72 routes) imports cleanly, `ruff check` is clean, and the 11 DB-free unit tests still pass unaffected. The two new migrations, the RLS policies, and all 15 new `requires_db` tests are written but **not executed against a real database** — 72 tests now skip cleanly pending that. `alembic upgrade head` then `pytest` will cover Phases 2 through 5 together in a single pass once a database is available.

### Phase 6 — Audit Logs, Reporting, Attachments, Notifications

**Models & migrations**
- [x] `app/models/attachment.py` (`Attachment`), `app/models/notification.py` (`Notification`). `audit_logs` already existed from Phase 2 (writer only) — this phase adds the reader.
- [x] `alembic/versions/0009_attachments_notifications.py` — hand-written DDL for both tables.
- [x] `alembic/versions/0010_attachments_notifications_rls.py` — RLS + `FORCE ROW LEVEL SECURITY` on both tables. Adds `current_app_can_access_attachment_entity(entity_type, entity_id)`, a dispatch function with one branch per `entity_type` that mirrors that entity's own existing SELECT policy (`tasks`, `eod_reports`, `projects`, `customers`, `machines`, `service_calls`, `service_reports`) — needed because `attachments.entity_id` has no DB-level FK to check against directly.
- [x] **Schema addition beyond the original design**: `attachments.is_active` (boolean, default true) — needed to represent the soft-remove `DELETE /attachments/{id}` was already documented as doing.

**Business logic**
- [x] `app/services/storage.py` — backend-agnostic storage interface with two implementations: `LocalFilesystemStorage` (real files on local disk, selected automatically whenever Supabase credentials aren't configured — every environment encountered so far, including this one) and `SupabaseStorage` (calls the Supabase Storage REST API directly over `httpx`, no SDK dependency). **Only `LocalFilesystemStorage` has been exercised** — it has its own database-free unit test suite (`tests/test_storage.py`, 6 tests, **executed, all pass**). `SupabaseStorage` is written but unverified, same status as every other infrastructure-dependent piece of this backend.
- [x] `app/services/attachment_service.py` — validates uploads (25MB default ceiling, an extension allow-list, and magic-byte content sniffing that rejects a file whose actual bytes don't match its claimed extension — e.g. a `.png` renamed to `.pdf`); dispatches read-access checks to each entity's own existing authorized getter (`task_service.get_task`, `customer_service.get_customer`, etc. — one implementation of "can this caller see this record," reused, not duplicated) and a narrower write-access rule per entity type for upload/delete (e.g. any Manager can *view* a customer per the Phase 5 hybrid model, but only an edit-scoped Manager can attach a file to one).
- [x] `app/services/audit_service.py` gained `list_audit_logs` (Owner-only) alongside the existing writer.
- [x] `app/services/notification_service.py` — list/mark-read/mark-all-read. **No producer wired up yet** — nothing in the task/leave/service-call services calls "create a notification" automatically; that's explicitly allowed to wait (context.md §28) and is future work needing no further migration.
- [x] `app/services/report_service.py` — five aggregate queries (attendance, tasks, leave, workload, service activity), all scoped by the same hierarchy rule as the underlying list endpoints (Owner company-wide, Manager subtree) since they aggregate data the caller could already see individually.
- [x] Two more private helpers made cross-module-public for reuse by `attachment_service.py`, following the precedent `service_call_service.py` set in Phase 5: `customer_service.can_edit_customer`, `machine_service.can_edit_machine`.

**Endpoints** (wired into `app/api/v1/router.py`)
- [x] `/attachments` (upload), `/attachments/{id}` (get metadata + `download_url`), `/attachments/{id}/download` (streams the file through the app — **not in the original design sketch**, added because `LocalFilesystemStorage` needs *some* HTTP route to serve a file from, and it doubles as a Supabase proxy fallback), `/attachments/{id}` (delete).
- [x] `/audit-logs` (Owner-only read).
- [x] `/notifications` (list/mark-read/mark-all-read).
- [x] `/reports/attendance`, `/reports/tasks`, `/reports/leave`, `/reports/workload`, `/reports/service-activity`. **No `/reports/customer/{id}/history` or `/reports/machine/{id}/history`** — see the Phase 5 service-history decision; that data is already reachable via existing list endpoints.

**Tests**
- [x] `tests/test_storage.py` — 6 tests, **executed, all pass** (no database needed): upload/download round-trip, nested directory creation, delete (including deleting a nonexistent file, which must not raise), the local-storage signed-URL placeholder, and path-traversal rejection.
- [x] `tests/test_attachments.py` — 6 `requires_db` tests: a Manager can attach a file to a task they created, an unrelated Employee cannot, a disallowed extension is rejected, content whose magic bytes don't match its extension is rejected, the full upload → download → delete round-trip (including a 404 after delete), and only an edit-scoped Manager (not just any Manager who can view it) can attach a file to a customer.
- [x] `tests/test_audit_logs.py` — 2 `requires_db` tests: Owner can list audit logs and finds the `user.created` entry from a just-created user; a Manager gets 403.
- [x] `tests/test_notifications.py` — 3 `requires_db` tests (using a direct-insert helper since nothing produces notifications automatically yet): a user sees only their own notifications, marking read requires being the recipient, mark-all-read clears every unread notification for that user.
- [x] `tests/test_reports.py` — 3 `requires_db` tests: an Employee is rejected from every report endpoint, a Manager's task report is correctly scoped to their subtree (a sibling Manager's identical query returns zero), and the workload report reflects an actual open task count.

#### Phase 6 verification note — what is proven vs. not

The full codebase (85 routes) imports cleanly and `ruff check` is clean. Two pieces are **actually executed and passing** in this environment, not just written: the 11 original DB-free unit tests, and the new 6-test `tests/test_storage.py` suite exercising the local filesystem storage backend for real. Everything else from this phase — both migrations, the RLS policies (including the new attachment-entity dispatch function), `SupabaseStorage`, and all 14 new `requires_db` tests — is written but **not executed against a real database**; 86 tests now skip cleanly pending that. `alembic upgrade head` then `pytest` will cover Phases 2 through 6 together in a single pass once a database is available.

### Phase 7 — Testing, Security, Documentation, Performance

**New functionality**
- [x] `app/core/rate_limit.py` — an in-memory sliding-window rate limiter applied to `POST /auth/login` and `POST /auth/refresh` (the classic brute-force targets, and the only endpoints with no session yet for the existing per-account lockout to key off). Single-process only; a multi-instance deployment needs a shared store (Redis) instead — this is Open Decision #6, still unresolved. **Executed and verified two ways**: `tests/test_rate_limit.py` (4 tests, no database, all pass) exercises the limiter class directly, and a manual smoke test against a running server confirmed the 11th request in a window gets `429` while the first 10 go through to the real route (the *route* then failed with a DB-connection 500, exactly as expected with no database configured — confirming the limiter fires at the right point in the request lifecycle, not too early or too late).
- [x] `GET /calendar` — the Team Calendar (context.md section 10). **This was documented in `api-contract.md` since Phase 0 and never actually built in any of Phases 1-6** — found during this phase's documentation-reconciliation pass (see below) and implemented now: a read-only composite of tasks (by `task_date`) and leave (by date-range overlap), scoped like every other list endpoint (self + full manager subtree), not the finer-grained per-subordinate-manager-grant behavior originally sketched (simplified for consistency with the rest of the codebase — see the note in `api-contract.md` section 9). 2 new `requires_db` tests.

**API-contract reconciliation** — compared every actually-registered route against every row in `api-contract.md` and found three gaps, all now fixed (not just documented as known issues):
1. `GET /calendar` — documented, never built. Fixed above.
2. `GET /attachments?entity_type=&entity_id=` — there was no way to discover which attachment IDs exist for a record before calling `GET /attachments/{id}` on each one individually. Added `attachment_service.list_attachments`, the endpoint, and a test.
3. `GET /service-calls/{id}/assignments` — there was no way to see who is currently assigned to a service call without already knowing an `assignment_id` from a prior response (e.g. after a page reload, the frontend would have had no way to render the current assignment list at all). Added `service_call_service.list_assignments`, the endpoint, and extended an existing test to cover it.

Every other endpoint documented in `api-contract.md` was cross-checked against the live route table (`app.routes`) and matches. The two customer/machine service-history endpoints dropped in Phase 5, and the narrower calendar scoping, remain the only deliberate documented deviations from the original Phase 0 design sketch.

**Security review** — went through context.md section 31's checklist item by item against the actual code (not just re-asserting design intent):
- **Password handling**: Argon2id, verified via `tests/test_security_utils.py`. No plaintext password ever appears in an audit log — checked every `record_audit_log` call site (`user.created`, `user.password_changed`, `user.password_reset`, etc.); the two password-change/reset actions log no `old_value`/`new_value` at all, by design.
- **Secure sessions**: httpOnly cookies, short-lived JWT access tokens, rotating opaque refresh tokens hashed at rest, CSRF double-submit on mutating requests.
- **Backend authorization**: verified every one of the 88 routes requires an auth dependency except the two intentionally-public health checks and `/auth/login`/`/auth/refresh`, by a pattern-count check (`async def` occurrences vs. `current_user: CurrentUser` occurrences per file) rather than eyeballing — every file's counts matched exactly.
- **Database authorization (RLS)**: cross-checked every table created across all five DDL migrations (26 tables total) against the five RLS migrations and confirmed every single one has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` — no table was missed.
- **Input validation**: Pydantic schemas on every request body; file uploads validated for size, extension allow-list, and magic-byte content sniffing (Phase 6).
- **SQL injection**: grepped for any f-string/string-formatted SQL — found none in `app/`; all `ILIKE` search filters use SQLAlchemy's parameterized `Column.ilike()`, never raw string concatenation. The only `f"..."` usage inside `op.execute(...)` in the migrations interpolates hardcoded Python table-name constants, never request data.
- **API authorization**: never trusts a role/user id from the client — `CurrentUser` is always derived from the verified JWT + a fresh DB read, per `app/api/deps.py`.
- **File upload validation**: extension allow-list, 25MB default ceiling, magic-byte sniffing that rejects content/extension mismatches (Phase 6).
- **Secrets management**: grepped for hardcoded passwords/secrets/keys in `app/` — none found; `.env.example` contains only placeholder/localhost values, never a real credential.
- **Rate limiting**: added this phase (see above) — was the one item on the checklist genuinely missing before Phase 7.
- **Secure CORS**: `allow_origins` is always the explicit configured list (defaults to empty, i.e. fail-closed, if unset) — never a wildcard, verified by reading `app/main.py` directly.
- **Secure error handling**: confirmed via the existing `/health/db` and login tests that a real backend failure (no database reachable) produces a generic `{"error": {"code": "internal_error", ...}}` with a correlation id, never a stack trace or connection string, both through the test client and a live server.
- **Audit logging**: confirmed insert-only via the Phase 2 trigger; confirmed (again, this phase) that no audit entry ever contains password material.

**Fixes made during the review** (not just findings — applied):
- `app/main.py`: `docs_url`/`redoc_url` were disabled in production, but FastAPI still serves the raw schema at `/openapi.json` unless `openapi_url` is *also* disabled — fixed, and verified by actually toggling `ENVIRONMENT=production` and confirming all three are `None`.
- `.gitignore`: the local attachment storage directory (`var/`, may contain uploaded file content in dev/test) was not excluded — added.
- `.env.example`: the Phase 6/7 settings (`LOCAL_STORAGE_DIR`, `ATTACHMENT_*`, `LOGIN_RATE_LIMIT_*`) were never documented there despite existing in `app/core/config.py` since Phase 6 — added, with their defaults.

**Performance review** — honest about what's possible without a live database: no `EXPLAIN ANALYZE`, no load testing, no query-plan verification happened, because there is still no reachable Postgres in this environment. What was done is a static review:
- Every foreign key column used in a `.where()` filter across every service module has an index (spot-checked against the actual migration DDL, not just assumed).
- `manager_hierarchy_closure` — the table every hierarchy-scoped query touches — has its PK on `(ancestor_id, descendant_id)` (covers "who does X manage") plus a separate index on `descendant_id` (covers "who manages X"), so both directions of the closure-table lookup are indexed, not just one.
- List endpoints use `OFFSET`/`LIMIT` pagination, which has a well-known cost-at-large-offsets issue; acceptable for a company-internal tool's realistic row counts, but would need cursor-based pagination if the dataset grew far beyond that — noted as a scaling limitation, not fixed pre-emptively for a problem that doesn't exist yet.
- RLS policies that chain multiple `EXISTS`/`JOIN` subqueries (e.g. `service_reports`, `attachments`) are the pieces most likely to need attention under real load and real data volume — flagged as the first place to look if a performance issue surfaces after the database-verification pass.

#### Phase 7 verification note — what is proven vs. not

The full codebase (88 routes) imports cleanly and `ruff check` is clean. `tests/test_rate_limit.py` (4 tests) is genuinely executed and passing, alongside the pre-existing 17 DB-free tests (21 total). The new `GET /calendar` and its 2 tests, the attachments-list and service-call-assignments-list endpoints and their tests, and every RLS/migration change from this phase are written but **not executed against a real database** — 89 tests now skip cleanly pending that. `alembic upgrade head` then `pytest` will cover Phases 2 through 7 together in a single pass once a database is available — that pass remains the single most important next action before this backend can be called production-ready, and no phase of work substitutes for it.

### Frontend handoff pass (post-Phase 7)

Per the user's direction — "complete whatever is possible, so that we can move forward with front end with Antigravity; once the database is ready we will come back to all these parts that need database again" — this pass maximized what the Antigravity frontend agent can build against right now, with no code changes to backend logic:

- [x] Generated `docs/openapi.json` (228KB, 64 paths) from the live `app.openapi()` schema — a machine-readable artifact for TypeScript codegen, exact request/response shapes, and Swagger/Redoc tooling, independent of database availability. Verified by actually starting the server (`uvicorn`, port 8020) and confirming `GET /docs` and `GET /openapi.json` both return 200 with no database configured.
- [x] Rewrote `docs/api-contract.md`'s status header: it previously still said "Proposed — pending approval" from Phase 0, which was stale and would have misled a frontend agent about whether the backend existed yet. Now states implementation status accurately and points to `docs/openapi.json`/`/docs` as the source of truth for exact shapes, with this file remaining authoritative for permission semantics only.
- [x] Added an **Enums Reference** section (§20) to `api-contract.md` consolidating every `CHECK`-constrained value set (roles, task/project/leave/service-call statuses, priorities, contact methods, service types, visit types, attachment entity types, permission scope/effect) in one table, cross-checked directly against every `ck_*_valid` constraint in the Alembic migrations rather than transcribed from memory — useful for frontend dropdowns/badges without hunting through migration files.
- [x] Added a **Getting Started for Frontend Integration** section to `api-contract.md`: how to get exact types, the auth/CSRF flow in practice, the shared list/error envelope shapes, and an explicit statement of what won't work yet (anything touching the database) versus what can be built now (UI, forms, routing, client-side validation against mock data).
- [x] Removed the temporary local `backend/.env` (gitignored, dev-only secret) created to run the server for the OpenAPI export/smoke test — no longer needed since the export is now a committed file.

No backend code, schema, or business logic changed in this pass — it is documentation/artifact-only, aimed entirely at making frontend integration possible without waiting for the database.

---

## Phase Plan

Superseded the original Phase 0 proposal's grouping with the user's explicit 7-phase implementation order (approved). Restated as backend deliverables:

### Phase 1 — Foundation (complete)
- [x] Project/backend setup, FastAPI app factory, configuration, environment variables, database connection, logging, error handling, base project structure.
- [x] Verified end-to-end (install deps, run server, run tests, lint) — see environment notes above.

### Phase 2 — Authentication, Users, Hierarchy, Permissions (implemented; DB verification pending)
- [x] `users`, `user_credentials`, `sessions`, `manager_hierarchy_closure`, `permission_definitions`, `role_permissions`, `permission_grants` models + two Alembic migrations
- [x] Auth endpoints (`/auth/login`, `/logout`, `/refresh`, `/me`, `/change-password`, admin `/users/{id}/reset-password`)
- [x] Core authorization dependency + service-layer permission evaluator (§5 of `permissions.md`)
- [x] RLS policies for identity/permission tables
- [x] Base audit logging utility (`audit_logs` writer used by all later services)
- [x] Test suite written: self-access, manager-subtree access, owner override, permission-grant precedence — see Phase 2 verification note above for what's actually been executed

### Phase 3 — Tasks, Projects, Leave, EOD (implemented; DB verification pending, together with Phase 2)
- [x] `tasks`, `task_history`
- [x] `projects`, `project_members`
- [x] `leave_requests`, `leave_approvals`
- [x] `eod_reports`
- [x] Tests written: task assignment scoping, project permission grants, leave approval-chain authorization — see Phase 3 verification note above for what's actually been executed

### Phase 4 — Attendance (implemented; DB verification pending, together with Phases 2-3)
- [x] `attendance_events`, `attendance_days`
- [x] Punch-in/punch-out endpoints with event-scoped (not continuous) location capture
- [x] Attendance reports scoped by hierarchy (`GET /attendance`, filterable, paginated)
- [x] Tests written: attendance scoping, location captured only at punch time — see Phase 4 verification note above for what's actually been executed

### Phase 5 — Service Management (implemented; DB verification pending, together with Phases 2-4)
- [x] `customers`, `customer_contacts`
- [x] `machines`
- [x] `service_calls`, `service_assignments`, `service_visits`, `service_reports`
- [x] Service history reachable via existing list endpoints (no separate aggregate endpoint — see note above)
- [x] Tests written: assigned-employee/responsible-manager/unrelated-manager access — see Phase 5 verification note above for what's actually been executed

### Phase 6 — Audit Logs, Reporting, Attachments, Notifications (implemented; DB verification pending, together with Phases 2-5)
- [x] `audit_logs` read endpoint (Owner-only) — writer already existed from Phase 2
- [x] Reporting APIs (`/reports/*`)
- [x] `attachments` table + upload/validation pipeline + storage backend abstraction (local filesystem, verified; Supabase Storage, written but unverified — no project configured)
- [x] `notifications` table + in-app list/read endpoints (no automatic producers yet — by design, see note above)

### Phase 7 — Testing, Security, Documentation, Performance (implemented; DB verification pending, together with Phases 2-6)
- [x] Full automated test suite across all modules — 112 tests total (23 executed and passing right now; 89 `requires_db`, skipping cleanly pending a database)
- [x] Security review: auth, authorization, RLS, input validation, file uploads, secrets, CORS, rate limiting, error leakage, audit logs, DB permissions — see the detailed findings above; three real fixes applied (`openapi_url`, `.gitignore`, `.env.example`), rate limiting added (the one item that was genuinely missing)
- [x] `api-contract.md` reconciled against actual implemented endpoints — found and fixed three real gaps (`/calendar` never built, no attachments list, no service-call-assignments list), not just re-read and re-approved
- [x] Performance review — static analysis only (indexes, closure-table access patterns, pagination strategy); no live-database load testing was possible in this environment, honestly flagged as such above

---

## Open Decisions Awaiting Business Input

Full context for each is in the linked doc. All items except #6 have now been **implemented with a specific default** rather than left blocking — the user can redirect any of them and the affected code is small and localized. #6 (Redis) remains genuinely open, relevant only to Phase 7 rate limiting.

| # | Question | Status | Detail |
|---|---|---|---|
| 1 | Employee ID generation: auto-sequence vs. Owner-assigned | **Implemented as Owner-assigned**: `POST /users` requires `employee_code` in the request body; no auto-generation exists. Easy to add later without a schema change if wanted. | `architecture.md` §11.1 |
| 2 | Confirm admin-only password reset (no self-service recovery channel) | **Implemented**: `POST /users/{id}/reset-password`, Owner (any user) or Manager (subtree only), sets `must_reset=true` and revokes all of the target's sessions. No self-service recovery exists. | `architecture.md` §11.2 |
| 3 | Leave approval: single-level vs. configurable multi-step chain | **Implemented as single-level** (direct manager only, one decision finalizes). Schema (`leave_requests.current_approver_id`, `leave_approvals.sequence`) supports a multi-step chain later without a migration. | `architecture.md` §11.3 |
| 4 | Confirm designation is free-text, independent of role | **Implemented**: `users.designation` is a free-text nullable column, `users.role` a separate constrained enum. | `architecture.md` §11.4 |
| 5 | Single manager per user (tree) vs. future matrix reporting | **Implemented**: `users.manager_id` is a single self-referencing FK; the closure table and every permission check assume a tree. Matrix/dotted-line reporting would need a schema change, not just a config change. | `architecture.md` §11.5 |
| 6 | Redis (or equivalent) availability for rate limiting/session store | Still open. Sessions live in Postgres regardless. Rate limiting (Phase 7) is implemented in-memory, single-process — correct for one backend instance, but a multi-instance production deployment needs a shared store (Redis) instead of the current implementation. | `architecture.md` §11.6 |
| 7 | Company timezone for attendance/EOD "date" boundaries | **Implemented as UTC**: `attendance_days.work_date` is the UTC calendar date of the punch event. If the company operates in a single non-UTC timezone, employees near midnight local time could see a punch land on the "wrong" day — flagging this as worth confirming before real-world use, easy to change to a configured offset. | `architecture.md` §11.7 |
| 8 | Can Managers create Employee users, or Owner-only? | **Implemented as Owner-only**: `POST /users` is gated by `require_owner`. | `api-contract.md` Open Questions #1 |
| 9 | Customer/machine visibility scope for unassigned staff | **Implemented as a hybrid**: Owner/Manager see the full customer/machine directory; Employees are assignment-scoped. Editing is narrower than viewing — see `api-contract.md` §10. | `api-contract.md` Open Questions #2 |
| 10 | Cross-employee visibility of service reports on a jointly-assigned call | **Implemented as own-report-only**: an Employee never sees a teammate's report, even when jointly assigned to the same call. | `api-contract.md` Open Questions #3 |
| 11 | Does Owner use EOD/attendance features personally? | **Implemented as yes, optionally**: nothing in `/eod`, `/leaves`, or `/attendance` prevents the Owner from using them for their own record; Owner leave auto-approves since there's no one above them to decide it. | `api-contract.md` Open Questions #4 |
| 12 | Does "Manager A cannot see Manager B" need an explicit deny row, or is absence-of-allow sufficient? | **Implemented as both**: `permission_grants.effect` supports `allow` and `deny`; deny always wins over allow, which always wins over the hierarchy default. The Owner-facing grants UI (frontend concern) can start with allow-only and add deny later without a backend change. | `permissions.md` §9 |

## Next Step

All seven phases of the user's implementation order are now built, and the post-Phase-7 frontend handoff pass is complete: `docs/openapi.json` is generated and committed, `docs/api-contract.md` has an accurate status header, a consolidated enums reference, and a frontend getting-started section. Antigravity can start frontend development against this contract now. Per the user's explicit direction, Phases 3 through 7 were each implemented without waiting for the Phase 2 database-verification pass; that verification is deferred to when a database is available and tracked here so it isn't lost. **It is now the only thing standing between this backend and "verified, not just written":**

1. Point `DATABASE_URL` at a real, disposable PostgreSQL database (a Supabase project or a local instance) and confirm reachability.
2. Run `alembic upgrade head`, then `pytest`, and fix anything that surfaces across all ten migrations and all 89 `requires_db` tests accumulated across Phases 2 through 7.
3. Once that pass is green, re-run the Phase 7 security review's items that specifically depend on RLS actually running against real data (the `EXISTS`/`JOIN`-heavy policies flagged in the performance review are the ones most worth re-checking first) and do the live-database performance pass (`EXPLAIN ANALYZE` on the hierarchy/RLS-heavy queries) that wasn't possible without one.
4. After that, this backend is in a genuinely production-readiness-reviewable state — until then, "written and internally consistent" is the accurate claim, not "verified."
