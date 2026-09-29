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

## Tests

```powershell
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
  alembic/       # migrations
  tests/
```
