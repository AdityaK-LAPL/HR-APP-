# Development Status

Last updated: 2026-09-28

## Prompt progress (18-prompt plan) - updated 2026-10-09

| Prompt | Scope | Status |
|---|---|---|
| 1 | Supabase integration-test fixes | **Complete** - 121/121 tests pass against live Supabase (migrations 0001-0015) |
| 2 | Supabase security / RLS audit | **Complete** - RLS now enforced on application traffic (0013-0015); `anon`/`authenticated` locked out; 9 direct-DB RLS tests |
| 3 | Backend performance review | **Complete** - indexes 0012, set-based policies 0015; findings, monitoring advice and remaining risk documented below |
| 4 | Final API contract audit | **Complete** - see "API contract audit (Prompt 4)" below |
| 5-18 | Frontend, audits, UAT | Not started |

Prerequisites for Prompt 4 and the frontend prompts, all in place: Owner account seeded (`OWN001`, `python -m scripts.seed_owner`; password change required at first login), frontend `tsc -b` / `npm run build` / `npm run lint` pass (npm scripts now call `./node_modules/.bin/*` directly, which works despite the `:` in the project path), 404-for-invisible-records documented in `api-contract.md`. Known frontend scaffolding to remove in Prompt 6: `LoginPage.tsx` still has hardcoded "demo account" buttons (`OWN001`/`MGR001`/`EMP001` with a fixed password) that must not ship.

## API contract audit (Prompt 4) - 2026-10-09

**Method**: the live FastAPI routes, Pydantic schemas, generated OpenAPI and `api-contract.md` were compared mechanically (route set, query parameters, body field names, role guards, status codes) and by probing the running app with invalid requests; hand-written claims were checked against code, not the other way round.

**Result**: all 84 operations match by method and path; every documented request-body field name matches its schema. Differences found and resolved:
- `GET /permissions/definitions` is Owner-only in code; the contract said others could read it - contract corrected.
- Filters documented but not implemented (`tasks`: `date`/`date_range`; `leaves`/`eod`: `date_range`) and implemented but undocumented (`task_date`, `report_date`, `GET /hierarchy?root_user_id`) - contract corrected (backend unchanged).
- `GET /hierarchy` returns a flat list, not a tree; `/customers`/`/machines` have no `?search=`; health endpoints were undocumented; the contract header still claimed the backend had never touched a database; "all lists are paginated" was wrong (10 paginated, 3 wrapped-unpaginated, 13 bare arrays) - all corrected, with a new shapes/sorting table (§21).
- **Backend, additive**: malformed-input `422`s now include `error.details[{field,message,type}]` (input values never echoed); the OpenAPI document declared FastAPI's default `{detail:[...]}` 422 shape while the app returns `{error:{...}}`, so a generated client would have mistyped every error - it now declares the real `ErrorResponse` for 401/403/404/409/422 (and 429 on login/refresh).
- Tooling: `python -m scripts.contract_tools` regenerates `docs/openapi.json` and a generated per-operation reference (Appendix A); `--check` and `tests/test_contract_docs.py` fail the suite if either drifts. New `tests/test_api_errors.py` pins the error contract.
- Added the frontend integration checklist (§22): must-use / optional / special-permission endpoints and known gaps.

**Known backend gaps found by the audit - all resolved 2026-10-09 (migration `0016` + code)**
1. `view_manager_team` / `view_manager_reports` / `view_subordinate_manager_calendar` are now **enforced** in RLS and the service layer (`app_visible_user_ids`; grant on manager B covers B's whole branch; deny carves out of the grantee's own hierarchy and beats allow; read-only). 9 direct-RLS + 4 API tests in `tests/test_visibility_grants.py`. Decision recorded in `permissions.md` section 11.
2. New `GET /permissions/me` returns the caller's own role defaults and active grants.
3. `must_reset` is returned by login/`/auth/me` **and enforced server-side**: until the password is changed every endpoint except `/auth/me`, `/auth/change-password`, `/auth/logout` returns `403 password_change_required`.
4. Text filters escape `%`/`_`/`\` (`app/services/search.py`) so they match literally.

## RLS enforcement on application traffic (Prompt 2 completion) - 2026-10-06

**Problem**: every RLS policy was bypassed for the app's own queries (see the performance review below). The earlier audit's "RLS verified" statements were true for `anon`/`authenticated` and for the policy text, but not for application requests.

**Fix (migrations 0013-0015, `app/db/session.py`, `app/core/config.py`)**
- `0013`: new `hr_app_rls` role (NOLOGIN, **NOBYPASSRLS**). `set_rls_context()` now runs `set_config('role', 'hr_app_rls', true)` at the start of every request transaction (setting `APP_DB_ROLE`), so RLS applies to application queries. Grants are minimal: SELECT/INSERT/UPDATE/DELETE on business tables, only SELECT/INSERT on the append-only `audit_logs`/`task_history`/`leave_approvals`, nothing on `alembic_version`. Supabase's default grants of every table/function to `anon` and `authenticated` were **revoked** (this app never uses PostgREST).
- `0014` - three real policy bugs that enforcement exposed: (1) `leave_requests_update` WITH CHECK demanded `current_approver_id = me` although a decision sets it to NULL, so no manager could approve/reject; (2) an explicit `modify_project`/`delete_archive_project`/`assign_employees_to_project` grant did not make the project visible, so grants were useless - `projects_select`/`project_members_select` now admit an explicit unrevoked, unexpired ALLOW not overridden by a DENY (role defaults deliberately excluded); (3) services validating a target user outside the caller's subtree (assign a task to another manager, add any employee to a project, assign an employee to a service call) could no longer see it - a narrow `SECURITY DEFINER` function `app_user_stub()` returns only `id`, `role`, `is_active`, and only inside an authenticated request context (`app/services/user_lookup.py`). `users_select` stays tight.
- `0015`: the 22 policies calling `current_app_in_scope(col)` were rewritten as set-based `col IN (SELECT descendant_id FROM manager_hierarchy_closure WHERE ancestor_id = me)` (same semantics). Result with RLS enforced, 300k tasks: manager task count ~10 s -> 0.9 s, manager task report ~8.6 s -> 0.9 s, manager service-call list ~35 s -> 2.6 s, owner/employee lists a few ms. Remaining known cost: a *sub*-manager's newest-first task page ~2.3 s (the index walk must skip rows outside a small subtree); acceptable now, revisit with a per-assignee index strategy if tables grow.
- `AuditLog.id`/`created_at` are now generated client-side: an `INSERT ... RETURNING` makes PostgreSQL apply the SELECT policy to the new row, and `audit_logs` is readable only by the Owner, so every other role's audit write was rejected.

**Behavior change (deliberate, documented in `api-contract.md`)**: a record outside the caller's visibility now returns **404** instead of 403 - RLS hides the row, so the API never confirms it exists. 403 remains for "you can see it but may not do that". 12 tests were updated accordingly (each is annotated); `test_hierarchy_and_permissions.py` now expects `NotFoundError` for another employee's record.

**Verification**: new `tests/test_rls_enforcement.py` (9 tests, straight to the database: the app role is NOBYPASSRLS; an employee sees only self; an unknown identity sees nothing; manager sees own subtree but not a peer manager's; the app role cannot UPDATE/DELETE `audit_logs` and non-owners cannot read it; no access to `alembic_version`; `anon`/`authenticated` hold zero table grants; `app_user_stub` returns only 3 fields and nothing without a request context). Full suite against live Supabase with RLS enforced: **121 passed, 0 failed**.

**Security consequence to remember**: the application now has two independent authorization layers. A future service-layer bug that over-reads is capped by RLS; a policy bug is capped by the service layer. New tables must get RLS + FORCE + policies, and the default privileges in `0013` already grant `hr_app_rls` access to future tables.

## Performance review (Prompt 3) - 2026-10-06

Run against the real Supabase project (PostgreSQL 17.6) with a synthetic dataset created and **rolled back** inside one transaction (nothing left behind): 3,110 users in a 3-level tree (12,326 closure rows), 300k tasks, 50k leave requests, 180k attendance days, 5k customers, 20k machines, 60k service calls, 90k assignments. Query shapes were copied from `task_service`, `service_call_service`, `report_service` and `calendar_service`. Absolute timings include a remote link only for the connection, not for execution - `EXPLAIN ANALYZE` execution time is server-side.

| Query (as the app runs it today) | Before | After 0012 | Cause |
|---|---|---|---|
| Owner task list, page 1 | 612 ms | 6.6 ms | seq scan + sort of all 300k rows |
| Manager task list, page 1 (top / sub-manager) | 547 / 468 ms | 5.9 / 8.9 ms | seq scan, `assigned_by OR assigned_to IN (...)` |
| Manager service-call list | 187 ms | 25 ms | seq scan on `service_calls` |
| Employee task / service-call lists | 5 / 10 ms | 3 / 1 ms | already indexed |
| Manager task count (pagination total) | 693 ms* | 77 ms | table scan (*first run was cold-cache) |
| Task report, workload report, attendance report, calendar | 290-570 ms | 90-245 ms (tasks) | closure-subtree joins; acceptable at this volume |
| Customer name search | 2 ms | 2 ms | indexed |
| `service_call_code ILIKE '%x%'` | 61 ms | 61 ms | seq scan (leading wildcard) - needs pg_trgm if it grows |

**Indexes added (migration `0012`)**: `ix_tasks_task_date_created_at`, `ix_service_calls_created_at`. Upgrade, downgrade and re-upgrade were exercised on the dev database, and the full suite was re-run afterwards: 112 passed, 0 failed. Candidate indexes the planner did not use were not added.

**Static review**: no `refresh()` calls and no lazy ORM relationships (so no hidden N+1 from the ORM); the only per-item query loops are three small loops over distinct manager IDs in `customer_service`, `machine_service` and `service_call_service` (bounded by the number of distinct managers); list endpoints are paginated with LIMIT/OFFSET, but `attendance_report`, `hierarchy` (Owner view), `calendar` and several sub-resource lists are not paginated - the first two grow with headcount.

**IMPORTANT security/architecture finding (resolved - see "RLS enforcement on application traffic" below)**: the backend connected as the Supabase `postgres` role, which has `BYPASSRLS`, and `set_rls_context()` only set the `app.user_id`/`app.user_role` GUCs - it never switched role, so PostgreSQL RLS did not constrain the application's own queries and authorization was service-layer only. Measured with RLS actually enforced (`SET ROLE authenticated` + GUCs) before the fix: manager task list/count/report ~8.5 s and manager service-call list ~35 s, because `current_app_in_scope()` was a per-row call.

**Production monitoring recommendations**: enable `pg_stat_statements` and review the top queries weekly; log queries over ~500 ms (`log_min_duration_statement`); track `tasks`/`service_calls` table growth and re-run `EXPLAIN ANALYZE` on the list queries each time a table grows 5-10x; watch pooler connection saturation (Supabase caps client connections).

## Linux re-verification against live Supabase — 2026-10-06

Prompts 1 and 2 of the 18-prompt plan (integration-test fixes; Supabase security/RLS audit) were originally done on the Windows machine. This section records what was re-verified from the Linux project against the real development Supabase database.

- **Migration reconciliation**: the live database was at `0011` while this repo stopped at `0010`. `0011_fix_rls_recursion.py` (breaks the `service_calls`/`service_assignments` and `projects`/`project_members` RLS cycles with 7 `SECURITY DEFINER` helpers) was recovered from the old Windows session transcript — the file itself was never copied to Linux — and checked against the live database: all 7 function bodies and all 7 rewritten policies match. `alembic heads` = `0011`, live `alembic_version` = `0011`. No migration was run.
- **Test fix recovered**: `tests/test_leave_and_eod.py` re-logs in as the employee before cancelling (one client = one cookie jar).
- **Full suite against real Supabase (Linux, Python 3.14.7)**: **112 passed, 0 failed** (22 min — the project is remote). `ruff check app tests` clean. Prompt 1 target (0 failures) met.
- **Live RLS state**: all 26 business tables have RLS enabled **and forced**; 2–3 policies each; no policy is unconditionally open. `audit_logs`, `task_history`, `leave_approvals` have only INSERT/SELECT policies; `audit_logs` additionally has the `audit_logs_immutable` trigger (a `DELETE` raises "rows are immutable").
- **anon/authenticated**: with rows present in the database, `SET ROLE anon` and `SET ROLE authenticated` (no app GUCs) read **0 rows** from every table and are refused an `INSERT` into `audit_logs` (`InsufficientPrivilegeError`).
- **Storage**: bucket `attachments` exists and is private (25 MB limit).
- **Not yet done**: the Owner user has not been seeded (login is impossible until it is); the 3 frontend TypeScript errors were fixed on 2026-10-09 (`Card.tsx` `title` prop typing, `main.tsx` import extension, duplicate `minHeight` in `LoginPage.tsx` replaced by a `100dvh` `@supports` rule) - `tsc -b` and `vite build` now pass, lint has 0 errors (57 pre-existing warnings); the directory name containing `:` still breaks `npm run` and a normal `.venv`.
- **Test data**: the suite truncates the business tables before each test and leaves its last test's rows behind (a few users/sessions/tasks). The dev database should be treated as disposable test data until the Owner is seeded.

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

## Current Phase: Verified against a live database; security-audited. Performance pass done (Prompt 3; migration 0012).

All 7 phases are implemented, and both of the previously-deferred passes are now complete: the full backend has been run against a real Supabase PostgreSQL database (all 10 migrations applied, full pytest suite genuinely executed — **112 passed, 0 failed, 0 errors** — see the "Database Verification Pass" section below), and a dedicated security/authorization audit was performed directly against that live database (see "Security & Authorization Audit" below and `docs/permissions.md` §10), which found and fixed one real RLS bug. The only work still explicitly deferred is the live-database performance pass (`EXPLAIN ANALYZE` on hierarchy/RLS-heavy queries) and an optional defense-in-depth `REVOKE` on Supabase's default `anon`/`authenticated` grants.

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

### Database Verification Pass — the deferred Phase 2-7 pass, now done

A real Supabase project was connected (Session pooler, since the direct connection is IPv6-only and unreachable from this network). All 10 migrations applied cleanly on the first attempt. Running the test suite against it for the first time surfaced real bugs — exactly what this pass existed to find. Each was diagnosed to its actual root cause (per the working rule established for this pass: reproduce, inspect the traceback, identify the cause, fix the smallest correct layer, rerun) before being fixed:

1. **`SET LOCAL app.user_id = :param` is invalid under asyncpg.** `SET` is parsed as SQL syntax, not a function call, so PostgreSQL cannot bind a protocol-level parameter into it (psycopg2 accepted this only because it substitutes parameters client-side). Fixed in `app/db/session.py::set_rls_context` by switching to `SELECT set_config('app.user_id', :user_id, true)`, an ordinary function call that takes bind parameters normally.
2. **`updated_at` couldn't be read back after a write.** Every model using `TimestampMixin` had its server-generated `updated_at` expired after a flush, and reading it during response serialization attempted a lazy load, which async sessions forbid (`MissingGreenlet`). Fixed once, in the mixin, with `__mapper_args__ = {"eager_defaults": True}`, which fetches server-side defaults via `RETURNING` on insert and update.
3. **Naive vs. timezone-aware timestamps.** `Mapped[datetime]` without an explicit type mapped to naive `TIMESTAMP` while every migration declares `timestamptz`, and asyncpg rejects timezone-aware Python values against a naive column. Fixed with a `type_annotation_map = {datetime: DateTime(timezone=True)}` on the shared declarative `Base`.
4. **A bare `literal()` bound untyped.** `calendar_service.py` and `report_service.py` both had `select(literal(actor.id))` for an employee's own-id scope; `literal()` with no type gives asyncpg no type information, so it sends the UUID as text, producing `operator does not exist: uuid = text`. Fixed by replacing it with a plain Python list (`[actor.id]`), letting the type come from the column being compared against.
5. **Event-loop/connection-pool mismatch under pytest.** The app's `engine` is a module-level singleton whose asyncpg connections bind to whichever event loop is active on first use; pytest-asyncio's default function-scoped loops broke every test after the first one that touched the database (`RuntimeError: Event loop is closed`). Fixed by pinning `asyncio_default_fixture_loop_scope`/`asyncio_default_test_loop_scope` to `"session"` in `pyproject.toml`, and by having the one-off DB-reachability check in `conftest.py` dispose its own engine before returning (it runs in a throwaway loop via `asyncio.run`, so a connection left pooled there would be bound to a dead loop and hold a pooler slot).
6. **Supabase's pooled connection modes cap concurrent client connections project-wide, and SQLAlchemy's own defaults (`pool_size=5, max_overflow=10`, up to 15 connections from one process) collided with it** (`EMAXCONNSESSION: max clients reached in session mode - max clients are limited to pool_size: 15`). Fixed by adding configurable `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` settings (conservative defaults: 5/2) and disposing the engine at test-session end so nothing lingers for the pooler to reap.
7. **A real security bug: the login-lockout counter could never reach its threshold.** `authenticate()` incremented `failed_attempts` and set `locked_until` in memory, then raised on a wrong password without committing — `get_db` rolls back on any exception, discarding the increment every time. Fixed by committing before raising. Covered by `tests/test_auth_flow.py::test_login_lockout_after_repeated_failures`, which now genuinely exercises 5 failed attempts followed by a locked 6th attempt against the real database.
8. **Several test bugs, not application bugs**, in tests that log in as a second user mid-test and then reuse the first user's stale CSRF header — the httpx `AsyncClient` fixture holds one cookie jar, so the second login silently invalidates the first user's session, and the CSRF check correctly rejected the stale header with a 403 the test wasn't expecting. Fixed by re-logging in as the correct user immediately before each such request, across `test_projects.py`, `test_customers_and_machines.py`, `test_service_calls.py` (three call sites), `test_attachments.py`, and `test_leave_and_eod.py`. The service-layer logic under test in every one of these cases was already correct — confirmed by reading it before touching anything.

Final, clean, monitored full-suite run against the live database: **112 passed, 0 failed, 0 errors, 0 skipped, 1 warning (an unrelated FastAPI-internal `DeprecationWarning`), in 1769s (~29.5 minutes).** Every `requires_db` test that had been skipping since Phase 2 now runs for real, including every RLS policy, every trigger (hierarchy-closure maintenance, cycle prevention, audit immutability), and the real Supabase Storage bucket (created during this pass) for attachments.

### Security & Authorization Audit (live Supabase database)

A dedicated audit followed the same "reproduce, diagnose, fix the smallest correct layer, rerun" discipline, now directly against the live database rather than by re-reading migrations. Full narrative and reasoning lives here; the permission-model-relevant summary is cross-linked from `docs/permissions.md` §10.

**What was checked and how:**
- Every one of the 26 business tables' `pg_class.relrowsecurity`/`relforcerowsecurity` queried directly: all `TRUE`. (`alembic_version`, Alembic's own bookkeeping table, correctly has neither — it isn't application data.)
- Supabase's default `anon`/`authenticated` PostgREST roles were found to hold full table-level grants (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) on every table — a Supabase schema-wide default, not something this project requested. Exploitability was tested directly, not assumed: `SET ROLE anon`/`SET ROLE authenticated` with no `app.user_id`/`app.user_role` GUC set (exactly what a raw PostgREST request looks like, since only this app's own transactions ever set those GUCs), then attempting `SELECT count(*)`, `INSERT`, and `DELETE` against every sensitive table (`users`, `user_credentials`, `sessions`, `audit_logs`, `permission_grants`, and more). Result: every `SELECT` returned 0 rows, every `INSERT` was rejected, and a `DELETE FROM audit_logs` reported 0 affected rows with the table's real row count confirmed unchanged before/after. No row of real data was ever exposed or mutated.
- **One real bug found and fixed**: `service_calls`'s SELECT/UPDATE policies and `service_assignments`'s SELECT/write policies each embedded a raw correlated `EXISTS` into the other table, and the identical shape existed between `projects` and `project_members` — two genuine mutual RLS dependency cycles. These never leaked data (confirmed above — no policy branch ever resolves `TRUE` for a NULL-role connection), and never affected real authenticated traffic either (confirmed by running the exact same queries with a real `employee`/`manager` RLS context set — clean results, no recursion), which is consistent with the full 112-test suite passing with 0 failures before this was found. The cycle only manifested for a connection with no RLS context set at all. Fixed anyway, not left as a "currently harmless" quirk, since it is a structural fragility that a future schema change or Postgres planner update could turn into a real problem for authenticated users: migration `0011` extracts each cross-table lookup into a `SECURITY DEFINER` helper function (owned by the migration-running role, which has `BYPASSRLS`), so the lookup's internal query no longer re-triggers the calling table's own policy. Each function is a faithful, unmodified extraction of the exact boolean expression it replaces, including two cases where the original inline checks subtly differed from each other (`service_calls_select` includes `current_app_in_scope(...)` on the assignment check, `service_calls_update` doesn't) — kept as separate functions rather than merged, to avoid silently widening or narrowing either policy. Full pytest suite re-run after applying this migration: 112 passed, 0 failed — no behavior change for real users.
- **Audit-log immutability confirmed at the RLS layer directly**: `audit_logs` has a `SELECT` and an `INSERT` policy and no `UPDATE`/`DELETE` policy at all, so Postgres's RLS default-deny-per-command blocks mutation for every role, including Owner, independent of the separate `BEFORE UPDATE OR DELETE` trigger that unconditionally raises (two independent layers, deliberately).
- **Permission-precedence algorithm (deny > allow > hierarchy > role-default) read side by side in both layers** — `app/services/permission_service.py::has_permission` (Python) and `current_app_can_access()` (SQL, migration `0004`) — and confirmed to evaluate in the identical order.
- **Storage**: the `attachments` Supabase Storage bucket didn't exist yet (the actual cause of every attachment-upload test failure — not a code bug); created it as a private bucket. Confirmed the signed-URL flow never leaks the service-role key to a client: `SupabaseStorage.generate_signed_url` uses the key only as a server-side request header to *ask* Supabase for a signed URL, and the URL Supabase returns embeds its own short-lived scoped token, not the master key.

**Files changed:** `alembic/versions/0011_fix_rls_recursion.py` (new migration: 7 `SECURITY DEFINER` helper functions, 6 rewritten policies, fully reversible downgrade restoring the exact prior policy text); `app/db/session.py`, `app/db/base.py`, `app/models/mixins.py`, `app/core/config.py`, `app/services/calendar_service.py`, `app/services/report_service.py`, `app/services/auth_service.py`, `pyproject.toml`, `tests/conftest.py`, `.env.example` (from the database verification pass above); `tests/test_projects.py`, `tests/test_customers_and_machines.py`, `tests/test_service_calls.py`, `tests/test_leave_and_eod.py`, `tests/test_attachments.py` (test-only CSRF/session fixes). No RLS policy, permission check, authentication control, or CSRF check was weakened anywhere in either pass — every fix either corrected a bug in favor of stricter/more correct behavior (login lockout, RLS recursion) or corrected test setup to match already-correct enforcement (the CSRF/session cases).

**Remaining, not yet done (explicitly out of scope for this pass, tracked here so it isn't lost):**
- Explicitly `REVOKE ALL ... FROM anon, authenticated` on all 26 tables as defense-in-depth. Not currently exploitable (see above), but this app never uses Supabase's auto-generated REST API and there's no reason for those roles to hold any grant at all.
- Live-database performance pass (`EXPLAIN ANALYZE` on the hierarchy/RLS-heavy queries) — still not done; everything above was a correctness/security pass, not a performance one.

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

All seven phases are built, the frontend handoff pass is complete, the database-verification pass is complete (112/112 tests passing against a real Supabase database), and the security/authorization audit is complete (one real RLS bug found and fixed; everything else confirmed correct by direct testing against the live database, not just code review). What remains before calling this backend fully production-ready:

1. **Live-database performance pass** — `EXPLAIN ANALYZE` on the hierarchy/RLS-heavy queries (the `EXISTS`/`JOIN`-heavy policies on `service_reports`, `attachments`, `customers`/`machines` are the ones most worth checking first, per the Phase 7 static review). Not yet done; everything up to now has been a correctness/security pass.
2. **Optional defense-in-depth**: explicitly `REVOKE ALL ... FROM anon, authenticated` on all 26 tables. Not currently exploitable (verified directly), but this app never uses Supabase's auto-generated REST API and there's no reason for those roles to hold any table grant at all.
3. **Redis for rate limiting** (Open Decision #6 below) if this backend is ever deployed as more than one instance — the current in-memory limiter is correct for a single process only.
4. Beyond that, this backend is in a genuinely production-readiness-reviewable state, verified against a live database rather than merely written and internally consistent.
