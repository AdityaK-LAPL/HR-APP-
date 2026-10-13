# Production readiness review (Prompt 17)

Review date: 2026-10-12. Scope: the whole system as it exists in this repository and in the development Supabase project. **Nothing has been deployed and nothing here deploys anything.**

Legend - **GREEN** ready; **YELLOW** a decision or a piece of configuration is needed before go-live (the system works without it, but it must be consciously settled); **RED** blocking. No overall score is given on purpose.

## Decisions recorded for this review

| Question (asked of the owner, 2026-10-12) | Answer | Consequence |
|---|---|---|
| One backend process or several workers/instances? | **One process** | The in-memory login rate limiter is correct as it is (GREEN, with conditions below). No Redis is needed now |
| Web app and API on one domain behind one proxy, or two? | **One domain, one proxy** | Cookies stay first-party (`SameSite=Lax` works), `VITE_API_BASE` stays unset, the CSP/CORS stay minimal, one TLS certificate |
| Everything else (hosting vendor, domain name, Supabase plan and region, monitoring tool, backup target) | not decided | listed as YELLOW items below |

## The rate-limiting decision in detail

* The login/refresh limiter (10 requests per minute per client IP and endpoint) lives in the process's memory. With **one process** that is exactly right and survives restarts only in the sense that a restart forgets the counters (acceptable: the per-account lock-out below does not).
* What is *not* in memory, and therefore already safe if the deployment ever grows: **sessions and refresh tokens** (database), the **account lock-out** (5 failures -> 15 minutes, stored per account), the audit trail. There is no background job, scheduler or cache that assumes a single instance.
* **Conditions** for GREEN: run exactly one uvicorn process (`--workers 1`, no replicas, no autoscaling); run it behind the proxy with `--proxy-headers --forwarded-allow-ips=<proxy>` so the limiter sees the real client address (otherwise every user shares one counter).
* If several instances are ever planned: counters would multiply per instance and be forgotten per restart, so move the limiter to Redis (or enforce it in the proxy on `/api/v1/auth/login` and `/refresh`) *before* scaling. Nothing else in the application needs shared infrastructure.

## Checklist

### Backend

| Item | Status | Evidence / what is needed |
|---|---|---|
| Unsafe configuration cannot start | GREEN | Start-up refuses (outside the test run): a JWT secret under 32 characters or the example one, a non-HMAC algorithm, and in production `DEBUG` on, no / `*` / `http://` CORS origins, no Supabase storage (files would go to the server's disk), a non-local database URL without `ssl=require`. Tested (`test_security_audit.py`) |
| Secrets handling | GREEN | Environment variables only; `.env` ignored and never committed; the example has placeholders; no secret in the git history |
| Process, runtime and CI | YELLOW | No Dockerfile, service unit or pipeline exists by design (a reference unit is in `deployment.md`). Decide host, process manager and whether to add CI. The suite takes about 45 minutes against the remote database, so CI needs its own database - and tests now refuse to start on a machine configured as production |
| Python and dependency versions | YELLOW | Tested on Python 3.14; `backend/requirements.lock` pins the exact tested packages. Confirm the host provides 3.14 or run the suite on the host's version. `pip-audit`: Starlette 0.46.2 has 7 advisories, analysed in the security audit as not exploitable beyond the Host-header issue already fixed; plan the FastAPI/Starlette upgrade as its own change and add `pip-audit` to CI. `npm audit`: 0 |
| Rate limiting | GREEN | See above, with the single-process conditions |
| Background work | GREEN | None exists |
| Logging | GREEN | One line per request on stdout (method, route, status, duration, request id); unexpected errors logged with traceback and the id the person is shown; SQL echo only when `DEBUG` (forbidden in production); statement parameters are hidden from error logs; no tokens, passwords or query strings are logged |
| Log collection, retention, error tracking | YELLOW | Nothing ships stdout anywhere. Choose a log service and, if wanted, an error tracker; the audit trail in the database is separate and permanent |
| Health checks | GREEN / YELLOW | `GET /health` and `GET /health/db` exist. YELLOW: an external uptime monitor must be set up, and `/health/db` (unauthenticated, runs a query) should be rate-limited or restricted at the proxy |
| Responsiveness | YELLOW | Every request makes several database round trips (now fewer: the three context settings are one statement). Measured at 1-3 s per page from this laptop to a Tokyo project; with the backend in the **same region as the database** it is dominated by single-digit-millisecond hops. Choose the Supabase region next to the backend host (the development project is in Tokyo). No load test has been run: the company-size workload is small (one process, pool of 7 against a 60-connection project) but unmeasured |
| Database housekeeping | YELLOW | `sessions` rows are never purged (the application role cannot delete); a monthly SQL statement run as the database owner is in `deployment.md`. Soft-removed attachments stay in the bucket until a retention rule is decided |

### Database and Supabase

| Item | Status | Evidence / what is needed |
|---|---|---|
| Migrations from empty to head, and back | GREEN | `alembic downgrade base` then `upgrade head` ran cleanly through all 19 migrations on the live project on 2026-10-12; the rebuilt schema had RLS enabled **and forced** on all 26 tables, every `SECURITY DEFINER` function pinned, no delete privilege for the application role, and the 9 permission definitions seeded. Not yet run on a brand-new Supabase project (the migrations assume Supabase's `anon` / `authenticated` roles) |
| Migration process | GREEN | Manual `alembic upgrade head` as a release step; nothing migrates automatically. Rollback = restore the backup (the downgrades also work) |
| Row-level security and grants | GREEN | Verified by the final security audit (forced RLS everywhere, no permissive policies, append-only audit tables, `anon`/`authenticated` hold nothing) |
| Time zones | GREEN | The database runs in UTC, every timestamp column is `timestamptz` (none is timezone-less); business days (attendance, "today") follow the single company timezone `COMPANY_TIMEZONE` (default Asia/Kolkata), computed by the application, and the browser always shows company time (`GET /config`). Covered by `test_company_time.py` and `test_attendance_timezone.py`. A company in two timezones would need a design change - out of scope |
| Encrypted database connection | GREEN | The connection to the pooler is TLS 1.3 (verified). The driver's default is "prefer" (silent plaintext fallback), so production now **requires** `?ssl=require`. YELLOW upgrade: `ssl=verify-full` with Supabase's CA certificate also stops a man-in-the-middle |
| Connection pool | GREEN | 5 + 2 connections for the one process; the development project allows 60. Session pooler (prepared statements) |
| Separate production project | YELLOW | Create one; never point production at the development project (it holds test data and is wiped by tests). Choose region and plan |
| **Database backups** | YELLOW | Supabase platform backups depend on the plan (daily on paid plans, point-in-time recovery is an add-on). Decide the plan, the retention (RPO) and the time to recover (RTO), and **do a restore drill** before go-live |
| Supabase Data API | YELLOW | The REST/GraphQL API of the project is not used and every table is closed to its public key (verified), but switching the Data API off in the project settings removes the exposure entirely |
| First Owner and recovery | GREEN | `python -m scripts.seed_owner` creates the Owner with a one-time password; `python -m scripts.recover_account` unlocks or resets from the server |

### Storage

| Item | Status | Evidence / what is needed |
|---|---|---|
| Bucket configuration | GREEN / YELLOW | `attachments` is private, 25 MB limit, `storage.objects` has RLS on and no policies (verified through the API). YELLOW: set `allowed_mime_types` on the bucket as a second check behind the application's extension and content-signature checks |
| No local-disk storage in production | GREEN | The application refuses to start in production without Supabase storage credentials |
| **File backups** | **RED** | Supabase's database backups do not contain Storage objects. Nothing copies the bucket anywhere, so losing or emptying it loses every customer / service attachment permanently. Needs a decision and a scheduled copy to storage the company controls (see `deployment.md` section 6) and a restore test. The application only soft-removes files, which protects against accidental removal, not against loss of the bucket |
| Malware scanning of uploads | YELLOW | Not performed. Files are only ever served as downloads (never inline); decide whether the business wants scanning |
| Attachment retention | YELLOW | Soft-removed files are kept forever |

### Authentication, authorization, RLS

| Item | Status | Evidence |
|---|---|---|
| Authentication, sessions, cookies, CSRF | GREEN | Final security audit (Prompt 16): Argon2id, refresh rotation with theft detection, httpOnly/Secure/Lax cookies, CSRF, lock-out, rate limit, password policy |
| Authorization and RLS | GREEN | Authorization sweep 243/243, API audit 232/232, 196 backend tests, RLS forced on every table |
| Residual risks | YELLOW | Listed in the security audit: stateless 15-minute access tokens, no absolute session lifetime, lock-out can be provoked, no malware scanning |

### Frontend and PWA

| Item | Status | Evidence / what is needed |
|---|---|---|
| Production build | GREEN | `npm run build` clean; no source maps published; strict content-security policy built in; 364 unit tests; browser audits on desktop, tablets, phones |
| Static hosting and headers | YELLOW | The host must serve `dist/` with single-page fallback, send the security headers (a reference proxy configuration with the exact values is in `deployment.md`; it could not be run here - the same behaviours are exercised through `vite preview`), and serve `index.html` and `sw.js` with `no-cache` so a release is noticed |
| HTTPS, domain, certificate | YELLOW | Not chosen. Mandatory: service worker, installability, geolocation and `Secure` cookies do not work without HTTPS |
| PWA | GREEN | Manifest, icons (192/512/maskable/Apple), service worker (`/api` never cached), update prompt, offline shell with clear states; no offline business data by design |
| Product name and branding | YELLOW | The app is called "OpsFlow" in the manifest, title and header; confirm or change before the icons are installed on phones |
| Timezone and locale | GREEN | Company time from the server; dates are written in one format throughout; native date pickers follow the device |

### Testing and documentation

| Item | Status | Evidence |
|---|---|---|
| Automated tests | GREEN | Backend 196 (against live Supabase), frontend 364, plus the real-stack audits (`frontend/e2e`: API, authorization sweep, browser, CSP) |
| Continuous integration | YELLOW | None; the audits and the suite are run by hand. See Process above |
| Load / capacity test | YELLOW | Not done (see Responsiveness) |
| User acceptance | YELLOW | The UAT pack is ready (`docs/uat/`, 116 scenarios, dress-rehearsed); the exercise itself must be run by the company's users on real devices over HTTPS |
| Documentation | GREEN | `architecture.md`, `database.md`, `api-contract.md`, `permissions.md`, `development-status.md`, this review, `deployment.md`, `backend/README.md`, `frontend/README.md`, `frontend/e2e/README.md`. Stale statements found in this review ("NOT YET EXECUTED", "storage not verified") were corrected |

### Product scope and data protection (not engineering defects, but go-live decisions)

| Item | Status | Note |
|---|---|---|
| Notifications | YELLOW | The screens exist; nothing produces a notification yet (no backend producer). Decide whether v1 ships without them |
| Report export | YELLOW | There is no export (CSV/PDF) - reports are on screen only |
| Personal-data retention | YELLOW | Punch locations, attendance, leave reasons, audit entries are kept indefinitely (records are never hard-deleted by design). Decide the retention and the process for a person's request to see or remove their data; confirm the legal basis for recording location at punch time |
| Password recovery | GREEN | Administrative only, by design (no e-mail/phone channel): a manager or the Owner resets it; the Owner uses the server script |

## Blocking items (RED)

1. **No backup of the attachment files** (see Storage). Everything else is a decision or configuration.

## Not done, on purpose

Nothing was deployed, provisioned, or changed in any external service; no hosting, domain, certificate or monitoring account was created.
