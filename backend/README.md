# Backend — Company Management & Service App

FastAPI backend. See `../docs/architecture.md`, `../docs/database.md`, `../docs/permissions.md`, and `../docs/api-contract.md` for design; this file only covers running the code.

## Prerequisites

- Python 3.11 or later
- A reachable PostgreSQL database (a Supabase project's connection string, or a local Postgres for development)

## Setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
copy .env.example .env
# edit .env: set DATABASE_URL and JWT_SECRET_KEY at minimum
```

Generate a real JWT secret rather than leaving the placeholder:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

## Run the API

```powershell
uvicorn app.main:app --reload --port 8000
```

- Health check: `GET http://localhost:8000/api/v1/health`
- DB connectivity check: `GET http://localhost:8000/api/v1/health/db`
- Interactive docs (non-production only): `http://localhost:8000/docs`

## Database migrations

```powershell
alembic upgrade head          # apply all migrations
alembic revision --autogenerate -m "describe the change"   # generate a new migration after adding/editing a model
```

No migration that drops a column/table or otherwise destroys data should be applied without explicit confirmation — see the working rules in `context.md`.

## First Owner account

The API can only create users when an Owner is logged in, so seed the first one from `backend/`:

```bash
python -m scripts.seed_owner                    # employee code OWN001, random password printed once
python -m scripts.seed_owner --employee-code OWN001 --name "Jane Doe"
OWNER_PASSWORD='...' python -m scripts.seed_owner
```

If the Owner is ever locked out (five failed sign-ins lock an account for 15 minutes, and anyone who knows an employee ID can cause that), unlock it, or set a new temporary password, from the server:

```bash
python -m scripts.recover_account --employee-code OWN001                  # unlock only
python -m scripts.recover_account --employee-code OWN001 --reset-password  # new temporary password, printed once
```

It is idempotent (does nothing if the code exists) and creates the account with `must_reset = true`. **The test suite truncates the business tables**, so re-run the seed after running `pytest` against a shared development database.

## Row-level security

The app connects as the database owner but runs every request transaction as the `NOBYPASSRLS` role `hr_app_rls` (`APP_DB_ROLE`, created by migration `0013`), so PostgreSQL RLS applies to application queries in addition to the service-layer checks. A record outside the caller's visibility returns 404. Any new table needs RLS + `FORCE` + policies; keep hierarchy-scope policies in the set-based `col IN (SELECT descendant_id FROM manager_hierarchy_closure WHERE ancestor_id = ...)` form (see `docs/database.md`).

## Tests

```bash
pytest
```

Tests that don't need a database (routing/validation/error-shape, and the pure password/JWT/CSRF unit tests) always run. Tests marked `requires_db` (auth flow, hierarchy, permissions) need `DATABASE_URL` pointed at a real, disposable PostgreSQL database — **never production** — with migrations already applied:

```powershell
alembic upgrade head
pytest
```

If `DATABASE_URL` isn't reachable, `requires_db` tests skip cleanly instead of failing. Each of those tests starts from a `db_reset` fixture that `TRUNCATE`s the per-test-mutable tables (not the `permission_definitions`/`role_permissions` catalog, which migrations seed once as fixed reference data).

## Project layout

```
backend/
  app/
    core/        # config, logging, error handling
    db/          # SQLAlchemy engine/session, declarative base
    api/v1/       # routers, grouped by endpoint module
    models/      # SQLAlchemy ORM models (added per phase)
    schemas/     # Pydantic request/response models (added per phase)
    services/    # business logic + authorization decisions (added per phase)
  alembic/       # migrations (0001-0015)
  scripts/       # one-off admin scripts (seed_owner, recover_account)
  tests/
```
