# Deployment guide (reference - nothing here has been deployed)

Written for the topology chosen on 2026-10-12: **one backend process**, and the web app and the API served from **one domain through one reverse proxy**. Nothing in this repository deploys anything; this is what an operator does. Where a step could not be exercised in the development environment it says so.

```
 browser ──HTTPS──▶ reverse proxy (app.example.com)
                      ├─ /api/*   ──▶ uvicorn, ONE process, 127.0.0.1:8000
                      └─ everything else ──▶ static files of frontend/dist (SPA fallback to index.html)
 uvicorn ──TLS──▶ Supabase Postgres (session pooler)   and   Supabase Storage (private bucket)
```

Why one domain: the session cookies are `SameSite=Lax`, the page's content-security-policy allows connections to its own origin only, and `VITE_API_BASE` stays unset (the app calls `/api/v1`). Separate domains would need all three changed.

## 1. What must exist before the first release

| Item | Notes |
|---|---|
| A **separate production Supabase project** | Never reuse the development project: the test suite `TRUNCATE`s tables (it now refuses to run when `ENVIRONMENT=production`, but a database URL alone cannot be recognised). Pick the region next to the backend host (the development project is in Tokyo; each request makes several database round trips). Use the **session pooler** (port 5432), not the transaction pooler (the driver uses prepared statements) |
| A private storage bucket `attachments` | Public access **off**, file-size limit 25 MB, **allowed MIME types** set (pdf, png, jpeg, gif, webp, docx/xlsx/doc/xls, csv, txt). `storage.objects` must keep row-level security on with no policies |
| Host for the backend | Python **3.14** (the version the 196 tests and the audits ran on; `backend/requirements.lock` pins the tested packages). Any 3.12+ should work but has not been tested |
| Domain name and TLS certificate for the proxy | HTTPS is mandatory: service worker, install, geolocation and `Secure` cookies all need it |
| A place for secrets | The platform's secret store or a root-only environment file (mode 600); never the repository |
| Backups for the database **and** for the files | See section 6 - the file backup does not exist yet |

## 2. Backend environment

Set these (full list and defaults: `backend/.env.example`; the file is checked against `app/core/config.py` by hand, so a new setting must be added to both).

| Variable | Production value |
|---|---|
| `ENVIRONMENT` | `production` (Secure cookies, HSTS, `/docs` off, strict start-up checks) |
| `DEBUG` | `false` (the application refuses to start otherwise) |
| `DATABASE_URL` | `postgresql+asyncpg://<role>:<password>@<pooler-host>:5432/postgres?ssl=require` - **the `ssl=` part is required**: the application refuses to start without it for a non-local database. `ssl=verify-full` plus the provider's CA certificate (`~/.postgresql/root.crt`) additionally protects against a man-in-the-middle and is recommended |
| `JWT_SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(64))"`; at least 32 characters. Changing it signs everybody out |
| `CORS_ALLOWED_ORIGINS` | `https://app.example.com` (https only; never `*`) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Required in production (without them files would land on the server's disk). The service-role key bypasses all Supabase policies: backend environment only, never in the frontend build |
| `COMPANY_TIMEZONE` | `Asia/Kolkata` unless the company is elsewhere; it defines every business day |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `5` / `2` (7 connections for the single process; the development project allows 60 in total) |
| `LOGIN_RATE_LIMIT_MAX` / `_WINDOW_SECONDS` | `10` / `60` per client IP and endpoint. Do **not** raise for production; the browser audits raise it only on a development machine |
| `LOG_LEVEL` | `INFO` |
| `APP_DB_ROLE` | `hr_app_rls` (created by migration 0013; leaving it empty switches row-level security off for the application - never do that) |

## 3. First installation (once)

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.lock
alembic upgrade head                     # creates everything, including the hr_app_rls role and the policies
python -m scripts.seed_owner             # prints the Owner's one-time password; must be changed at first sign-in
cd ../frontend
npm ci && npm run build                  # -> frontend/dist
```

Rehearsed on the live Supabase project: `alembic downgrade base` followed by `alembic upgrade head` ran cleanly through all 19 migrations and the rebuilt schema had the same security properties (row-level security forced on every table, `SECURITY DEFINER` functions pinned, no delete privilege). A first install on a brand-new project has the same migration path but has not been run on one.

## 4. Running the backend (one process)

```ini
# /etc/systemd/system/hr-app.service        (reference - not exercised here)
[Service]
User=hrapp
WorkingDirectory=/opt/hr-app/backend
EnvironmentFile=/etc/hr-app/backend.env
ExecStart=/opt/hr-app/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips=127.0.0.1
Restart=on-failure
```

* **Exactly one process.** The login rate limiter keeps its counters in memory; a second worker or replica would multiply the allowance and give each its own counters. Sessions, the account lock-out counter and the audit trail are all in the database, so those are already safe to share. Nothing runs in the background (no scheduler, no queue) that would need a second process or a singleton.
* `--proxy-headers --forwarded-allow-ips=<the proxy's address>` makes the client IP the real one. Without it every user shares the proxy's address and the limiter would lock everyone out together.
* If the deployment ever needs several instances: move the limiter to Redis (or let the proxy rate-limit `/api/v1/auth/login` and `/refresh`), then raise `--workers`.

## 5. Reverse proxy (reference configuration)

Not exercised in the development environment (no proxy is installed there); the same behaviours - single-page fallback, `/api` forwarding, the security headers - are exercised through `vite preview`, which `npm run e2e:csp` and the browser audits use.

```nginx
server {
    listen 443 ssl http2;
    server_name app.example.com;
    # ssl_certificate / ssl_certificate_key ...
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # the app's own headers: copy the values from `securityHeaders` in frontend/vite.config.ts
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy no-referrer always;
    add_header Permissions-Policy "geolocation=(self), camera=(), microphone=(), payment=()" always;

    client_max_body_size 26m;                 # attachments are limited to 25 MB
    gzip on; gzip_types text/css application/javascript application/json image/svg+xml;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 70s;               # the database command timeout is 60 s
    }

    root /opt/hr-app/frontend/dist;
    location = /index.html { add_header Cache-Control "no-cache" always; }   # repeat the headers above in each block that sets any
    location = /sw.js      { add_header Cache-Control "no-cache" always; }   # the service worker must never be served stale
    location = /manifest.webmanifest { add_header Cache-Control "no-cache" always; }
    location /assets/      { add_header Cache-Control "public, max-age=31536000, immutable" always; }
    location /             { try_files $uri /index.html; }                   # single-page app: deep links open index.html
}
```

(nginx drops inherited `add_header` lines in any block that defines its own - put the security headers in an `include` file and repeat it in each location that sets `Cache-Control`.)

## 6. Backups and restore

| What | Mechanism | Status |
|---|---|---|
| Database | Supabase platform backups (daily on paid plans; point-in-time recovery is a paid add-on). The plan, retention and a **restore drill** are decisions for the owner | not configured by this repository |
| **Attachments** | Supabase's database backups **do not include Storage objects**, and the application only ever *soft*-removes files (they stay in the bucket, so accidental removal is recoverable, but loss of the bucket is not). A scheduled copy of the bucket to storage the company controls (for example `rclone` against Supabase's S3-compatible endpoint, or a nightly job that lists `attachments` and copies the objects) is required | **does not exist - blocking** |
| Configuration | The environment file and the proxy configuration, kept in the company's secret store / infrastructure repository | operator |

Restore order: Supabase restore (or point-in-time) of the database, then the files, then `alembic current` (must say `0019`), then `GET /api/v1/health/db`. Keep the Owner's recovery path in mind: `python -m scripts.recover_account --employee-code <ID> --reset-password` works from the server without the application login.

## 7. Releasing a new version

1. Back up (database; confirm the file copy ran).
2. `git pull`, `pip install -r requirements.lock`, `alembic upgrade head` (migrations are forward-only in practice: every one of them also has a working `downgrade`, but restoring the backup is the dependable rollback), restart the single process.
3. `npm ci && npm run build`, replace `dist/` in one step (rsync to a new directory, switch the symlink). Open tabs keep the old version until the person chooses "Reload to update", so a release never reloads a half-filled form.
4. Smoke test: sign in as each role, punch in / out, apply for leave, upload and download a file, open Reports.

## 8. Monitoring (to be chosen - none is configured)

* **Uptime:** an external check on `GET /api/v1/health` (process is up) and `GET /api/v1/health/db` (database reachable; answers 503 otherwise). `/health/db` is unauthenticated and runs a query - rate-limit it at the proxy or restrict it to the monitor's addresses.
* **Errors:** the application logs every unexpected exception with a traceback and the request id that the person sees in the error message ("Reference: ..."); ship stdout to a log service and alert on `ERROR`, or add an error tracker (Sentry or similar) - a decision for the owner. Statement parameters are never logged.
* **Security signals worth alerting on:** audit actions `user.account_locked` and `user.refresh_token_reuse`, spikes of `429` and `401` on `/api/v1/auth/*`.
* **Capacity:** Supabase connection count (the pool uses at most 7) and database size.

## 9. Routine maintenance

The application's database role cannot delete anything (by design), so housekeeping runs as the database owner (Supabase SQL editor or `pg_cron`):

```sql
-- expired or revoked sign-in sessions older than 30 days (the table otherwise only grows)
DELETE FROM sessions WHERE greatest(expires_at, coalesce(revoked_at, expires_at)) < now() - interval '30 days';
```

Soft-removed attachments stay in the bucket and in `attachments` (`is_active = false`); purge them only under a retention decision. `audit_logs` is append-only by design.

## 10. Variant: everything on Vercel (one project, Vercel Services)

Chosen on 2026-10-13 as an alternative to sections 4-5. `vercel.json` (repository root) defines two services in ONE project and so on one domain: `web` (the Vite build in `frontend/`, with the security headers and cache rules of section 5) and `api` (the FastAPI app in `backend/`, entrypoint `app.main:app`). `/api/*` goes to `api`, everything else to `web`; the API receives the original path (`/api/v1/...`), so no code depends on a prefix. Vercel Services is a **beta** feature and `vercel.json` has not been deployed from this repository yet.

What differs from the single-process design, and what was done about it:

| Topic | Consequence on Vercel | Handling |
|---|---|---|
| Request/response body limit | 4.5 MB per function call (413 `FUNCTION_PAYLOAD_TOO_LARGE`). Uploads and downloads pass through the API | Set `ATTACHMENT_MAX_SIZE_BYTES=4000000`. The web app shows "That file is too large to upload" for the platform's 413. Larger files need direct-to-Supabase uploads (not built) |
| Client IP | Not the TCP peer | `CLIENT_IP_HEADER=x-forwarded-for` (Vercel overwrites that header with the caller's address). Never set it on a host that does not |
| Login rate limit | In-memory, so counted **per function instance**: weaker than the one-process design. The per-account lock-out and the audit trail live in the database and are unaffected | Add a Vercel Firewall rate-limit rule on `POST /api/v1/auth/login` and `/api/v1/auth/refresh` (the shared limiter) |
| Database connections | Many short-lived instances | Use the Supabase **transaction pooler** (same host, port **6543**). `DATABASE_URL` on 6543 turns the driver's prepared statements off automatically (`DB_DISABLE_PREPARED_STATEMENTS` forces it). Per-request `set_config(..., true)` is transaction-local, so row-level security works through it. **Not yet exercised against a real transaction pooler** - check sign-in and a role-restricted list on the first deployment |
| Region | Functions run in `iad1` by default | Project Settings -> Functions -> Function Region: pick the one nearest the Supabase project |
| Python | Pinned by `backend/.python-version` (3.14); dependencies from `backend/requirements.txt` (version ranges, not `requirements.lock`) | |

Vercel project settings: import the repository with the root directory left at the repository root and the framework preset **Services**. Environment variables: the table in section 2, plus `CLIENT_IP_HEADER`, `ATTACHMENT_MAX_SIZE_BYTES` and the pooler URL above; do **not** set `VITE_API_BASE`. Set `CORS_ALLOWED_ORIGINS` to the final `https://<domain>`. Run `alembic upgrade head` and `python -m scripts.seed_owner` from a workstation against the production database (section 3), never from Vercel.
