# Backend Architecture

Status: **Proposed — pending approval.** No backend code has been written yet. This document, together with `database.md`, `permissions.md`, `api-contract.md`, and `development-status.md`, is the design deliverable for review before implementation begins.

Scope owner: backend/database/security engineering (this agent). Frontend is owned by a separate agent (Antigravity) and is out of scope here except where an API contract must be defined for it to consume.

---

## 1. Goals

- One backend serving a single responsive PWA frontend across Android, iOS, Windows, Linux, desktop and mobile browsers. No native apps, no per-platform backend variants.
- Company-controlled login identity (internal Employee/User ID + password) — no mandatory email, phone, or OTP.
- Strict server-side authorization following an Owner → Manager → Employee hierarchy with Owner-configurable, per-relationship overrides (not just role checks).
- Full historical retention for tasks, EOD reports, attendance, leave, and — especially — customer/machine/service history, even after users, customers, or machines are deactivated.
- Modular, migration-safe schema that can absorb the "Future Requirements" listed in `context.md` §36 (inventory, billing, AMC, etc.) without a rewrite.

## 2. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| API framework | Python + FastAPI | Async, strong typing via Pydantic, automatic OpenAPI generation (feeds `api-contract.md` and the frontend agent directly), good testability. |
| ORM / DB access | SQLAlchemy 2.x (async) + asyncpg | Parameterized queries by construction (SQL-injection safe), works against Supabase Postgres over a normal connection string — not locked into Supabase's REST layer. |
| Migrations | Alembic | Versioned, reversible, reviewable schema changes — matches the "use migrations, no destructive ops without confirmation" requirement. |
| Database | Supabase-hosted PostgreSQL | Managed Postgres, built-in Storage, generous free/low tier, RLS support, single source of truth the company owns (exportable — no lock-in). |
| File storage | Supabase Storage (private buckets, signed URLs) | Handles attachments (task files, EOD attachments, service photos, reports) without provisioning separate object storage. |
| Auth | **Custom, in FastAPI**, against the Postgres `users`/`credentials` tables — *not* Supabase Auth. See §4 for rationale. |
| Caching / rate limiting | Redis (or Supabase-compatible equivalent) | Login throttling, refresh-token/session store, future notification fan-out. Flagged as an infra dependency to confirm (see Open Questions). |
| Testing | Pytest + httpx (async client) + pytest-asyncio | Fast, isolated, runs against a disposable test schema/transaction per test. |
| Docs | FastAPI auto OpenAPI (`/docs`) + hand-maintained `api-contract.md` (authoritative for permission notes OpenAPI can't express) |

## 3. Backend Layering

```
┌─────────────────────────────────────────────────────────┐
│  Routers (FastAPI)                                       │
│  - request/response schemas (Pydantic)                   │
│  - authentication dependency (who is calling)             │
│  - no business logic                                       │
├─────────────────────────────────────────────────────────┤
│  Services (business logic)                                │
│  - authorization decisions (can THIS user do THIS to     │
│    THIS record) — see permissions.md                      │
│  - validation of business rules (e.g. "leave dates must   │
│    not overlap", "service call must reference a machine   │
│    owned by the customer")                                 │
│  - orchestrates repositories, writes audit log entries     │
├─────────────────────────────────────────────────────────┤
│  Repositories (data access)                                │
│  - SQLAlchemy queries/models only, no policy decisions     │
├─────────────────────────────────────────────────────────┤
│  PostgreSQL (Supabase) — RLS enabled as defense-in-depth   │
└─────────────────────────────────────────────────────────┘
```

Rules:
- Authorization is decided in the **service layer** (explicit, unit-testable, produces clear 403s) and re-checked by **RLS policies** in Postgres (fail-closed if a service-layer check is ever missed or the DB is queried through another path, e.g. Supabase Studio or a future reporting tool).
- Routers never issue raw SQL and never make authorization decisions themselves — they only wire the authenticated identity through to services.
- No frontend code, and no UI-only permission logic, will be trusted for authorization.

## 4. Authentication Architecture

### Decision: custom FastAPI auth, not Supabase Auth

`context.md` §2 requires login by an internal Employee/User ID with **no mandatory email/phone/OTP**. Supabase Auth's core flows are built around email/phone/OAuth identities; forcing it to accept an arbitrary internal ID means faking an email per user, which is a workaround, not a fit. Instead:

- `users` table stores the login identity (`employee_code`, unique, company-assigned — see Open Questions on generation rule) and profile fields (name, designation, role, manager_id, active flag).
- A separate `user_credentials` table stores `password_hash` (Argon2id) and password metadata (last changed, must-reset flag), kept apart from `users` so profile reads never need to touch credential data.
- FastAPI issues its own tokens on successful login: a short-lived **access token** (JWT, ~15 min) and a longer-lived **refresh token** (opaque, random, stored server-side hashed in a `sessions` table, rotated on every use, revocable individually or all-at-once per user).
- Tokens are delivered as `httpOnly` cookies - `Secure` whenever `ENVIRONMENT=production`, `SameSite=Lax` (the refresh cookie is also scoped to `/api/v1/auth`) - which keeps them away from JavaScript/XSS. State-changing requests need a CSRF token (double-submit: the readable `csrf_token` cookie echoed in `X-CSRF-Token`); `Lax` plus that custom header plus a CORS allow-list is what stops cross-site writes. (Bearer-header mode can be added later if a non-browser client needs it.)
- Postgres RLS still needs to know who the caller is even though we bypass Supabase Auth's `auth.uid()`. FastAPI opens each DB transaction and runs `SET LOCAL app.user_id`, `SET LOCAL app.user_role` (and similar GUCs) after validating the JWT, so RLS policies (see `permissions.md` §5) can reference `current_setting('app.user_id')`. This keeps Postgres-level authorization in sync with the API layer without depending on Supabase's own auth product.
- **Password reset without email/phone/OTP**: since there is no self-service recovery channel by design, reset must be an administrative action — a Manager (for their own employees) or Owner can force-set/reset a user's password, which invalidates all that user's existing sessions. This is called out explicitly in Open Questions for business sign-off.

### Session/token summary

| Token | Lifetime | Storage | Revocation |
|---|---|---|---|
| Access token (JWT) | ~15 min | httpOnly cookie | Expires naturally; also invalid once user is deactivated (checked on each request) |
| Refresh token | 14 days by default (configurable), renewed on every use | httpOnly cookie + hashed row in `sessions` | Rotated every use; **presenting an already-rotated token again (after a 60-second grace for races) is treated as theft and ends every session of that person** (`user.refresh_token_reuse` in the audit trail); a password change or reset revokes all sessions for that user; logout revokes the one session |

**Known limit:** the access token is stateless, so a *copy* of it stays valid until it expires (15 minutes) even after logout or a password change - the refresh token is what is revoked. Deactivation is checked on every request, and an account with a temporary password can do nothing but change it. Making revocation instant would cost a session lookup on every request.

### Start-up safety

The application refuses to start (outside the automated test run) with a `JWT_SECRET_KEY` shorter than 32 characters or copied from the example, and in production also with `DEBUG` on, no `CORS_ALLOWED_ORIGINS`, or any origin that is not `https://` (never `*`: cookies are sent with credentials).

## 5. Authorization Architecture (summary — full detail in `permissions.md`)

- Three roles: `owner`, `manager`, `employee`, stored on `users.role`.
- Reporting hierarchy: `users.manager_id` (self-referencing) forms a tree of arbitrary depth (Owner → Senior Manager → Manager → Employee, or deeper).
- A **materialized closure table** (`manager_hierarchy_closure`) precomputes every (ancestor, descendant) pair so "is user X in user Y's subtree" is an indexed lookup, not a recursive query on every request — this matters once RLS policies also need the same check on every row read.
- Default rule: a Manager can access data belonging to anyone in their subtree (direct or indirect reports) plus their own; an Employee can access only their own; the Owner bypasses all scope checks.
- Owner-configurable **permission overrides** (`permission_grants`) implement the specific cross-manager cases in `context.md` §12 (Manager A can/cannot see Manager B's team/reports, can/cannot assign tasks across managers, project-level modify vs. view-only, etc.), with explicit deny always winning over the default/allow.

## 6. File / Attachment Handling

- Single private Supabase Storage bucket (`attachments`, public access off - verified), path convention `{entity_type}/{entity_id}/{uuid}{extension}`: **the client's filename never reaches the storage path or URL**; it is cleaned (no directories, control characters, 150-character cap) and kept only as display text, offered back as the download name through `Content-Disposition: attachment` with an RFC 5987 `filename*`.
- An `attachments` table records metadata (owner entity type/id, uploader, mime type, size, storage path) so attachments are queryable/auditable independent of the storage backend.
- Uploads validated server-side: allow-listed extensions, size ceiling, re-checked by content sniffing (magic-byte signatures, not just the client-supplied extension), and served only via short-lived signed URLs — never a public bucket.
- **Implementation note (Phase 6):** the storage layer (`app/services/storage.py`) is a small backend-agnostic interface (`upload`/`download`/`generate_signed_url`/`delete`) with two implementations, chosen automatically from configuration: `SupabaseStorage` (calls the Supabase Storage REST API directly, no SDK dependency, for full visibility into the exact request/response shape) once `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are set, and `LocalFilesystemStorage` (real files under a local directory) whenever they aren't — which is the case wherever those variables are absent. The development environment is connected to a Supabase project, so `SupabaseStorage` has been exercised against it by the attachment tests and the browser audits; `LocalFilesystemStorage` remains the fallback for CI. `storage.objects` has row-level security on and no policies, so the project's public API key cannot read or write files; every file access goes through this application, which checks the caller's right to the owning record first.

## 7. Audit Logging

- A single generic `audit_logs` table (actor, action, entity type/id, old value, new value as JSONB, timestamp, request metadata) written by the **service layer** whenever a listed sensitive action occurs (`context.md` §24 and §14 give the canonical action list — reproduced in `database.md`).
- Audit rows are insert-only from the application's perspective: no API endpoint will expose update/delete on `audit_logs`, and a DB-level rule/trigger denies UPDATE/DELETE outright so audit history can't be casually edited even by a compromised app-layer bug.

## 8. Notifications (forward-looking, not built in Phase 1–3)

- A `notifications` table (recipient, type, payload JSONB, read_at, created_at) is included in the schema now so future channels (push, email, WhatsApp) can be bolted on without a schema change — only a delivery worker needs to be added later. Phase 1–4 ship in-app "list my notifications" only, per `context.md` §28.

## 9. Secrets & Configuration

- All secrets (DB connection string, JWT signing key, Supabase service key) come from environment variables, never committed. A `.env.example` (no real values) documents required variables. Production secrets are managed via the hosting platform's secret store.
- CORS is restricted to the known frontend origin(s) (configured per environment), not `*` - the application will not start in production otherwise.

## 12. Browser and response hardening (added by the final audit)

- Every API response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and under `/api/` also `Cache-Control: no-store` and a `default-src 'none'` content-security-policy; production adds `Strict-Transport-Security`.
- The single-page app is built with a strict content-security-policy (scripts, styles, fonts, images, connections and workers from its own origin only; no objects, no framing; forms and `<base>` locked to the origin) both as a `<meta>` tag and as the header set `vite preview` sends - the production static host must send the same headers (`frontend/vite.config.ts`, `securityHeaders`).
- Anything that depends on *which endpoint* a request is (the temporary-password restriction, the login rate limit, the header policy) uses the path the router matched, never `request.url`, which Starlette rebuilds from the client-supplied `Host` header.
- Passwords: at least 8 characters, not a common password, not containing the person's employee ID (Argon2id, 200-character cap).
- The application's database role holds no `DELETE` privilege (except on the reporting-line closure its own trigger maintains): history is preserved by the database, not only by the code. Every `SECURITY DEFINER` function pins `search_path = public, pg_temp`.

## 10. Non-Goals

- No native Android/iOS/Windows/Linux apps.
- No second frontend implementation — this agent produces API contracts and, where explicitly required, minimal example payloads only.
- No change to `context.md` requirements without explicit instruction; conflicts are documented, not silently resolved (see Open Questions in each doc).

## 11. Open Questions Requiring a Business Decision

1. **Employee ID generation**: auto-generated sequential code (e.g. `EMP0001`) vs. Owner manually assigns arbitrary IDs at user creation? Affects `users.employee_code` validation rules.
2. **Password reset flow**: confirmed as an Owner/Manager-administered reset (no self-service, since no email/phone/OTP) — please confirm this matches intent.
3. **Leave approval chain depth**: is leave always decided by the employee's *direct* manager, or can it require multi-step sign-off up the hierarchy (e.g. Manager then Senior Manager) depending on Owner configuration? Schema supports both (see `database.md`), but default workflow behavior needs confirmation.
4. **Designation vs. Role**: assumed `designation` is a free-text job title (e.g. "Senior Technician") independent of the fixed `role` enum (Employee/Manager/Owner). Please confirm.
5. **Single vs. multiple reporting lines**: assumed each user has exactly one direct manager (a tree). Matrix/dotted-line reporting (one employee under two managers) is not in `context.md` and is treated as a future requirement, not built now.
6. **Redis (or equivalent) availability** in the deployment environment for rate limiting and session/token bookkeeping — needs an infra decision before Phase 1 implementation.
7. **Company timezone — RESOLVED 2026-10-09: `Asia/Kolkata` (IST, UTC+05:30)**, configurable via `COMPANY_TIMEZONE`. Timestamps are stored and transmitted as UTC instants; business calendar dates (an attendance `work_date`, "today") are dates in the company timezone, so a day rolls over at 00:00 IST. See `app/core/company_time.py`.

These same questions are cross-referenced from `development-status.md` and should be resolved before or during Phase 1 implementation, not silently assumed.
