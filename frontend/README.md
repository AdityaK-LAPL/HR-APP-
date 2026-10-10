# Frontend (React + TypeScript + Vite PWA)

The architecture, conventions and delivery plan live in [`docs/frontend-architecture.md`](../docs/frontend-architecture.md).
The API it consumes is documented in [`docs/api-contract.md`](../docs/api-contract.md); types are generated from
[`docs/openapi.json`](../docs/openapi.json). The backend is authoritative: the frontend holds no business rules, has no
mock mode, and never touches the database.

> Status: foundation + authentication (Prompt 6), the **Employee (7)**, **Manager (8)** and **Owner administration (9)**
> experiences and **Service management (10)** are real. Dashboards/reports polish, notifications and PWA polish arrive in
> Prompts 11-13.

## Commands

```bash
npm ci
npm run dev        # http://127.0.0.1:5173, proxies /api to http://127.0.0.1:8000
npm run build      # tsc -b && vite build
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm test           # Vitest (unit + integration with an MSW API double)
npm run gen:api    # regenerate src/api/schema.d.ts from ../docs/openapi.json
npm run check:api  # fail if schema.d.ts is stale
```

Run the API first (`uvicorn app.main:app --reload` in `backend/`) and create the first Owner with
`python -m scripts.seed_owner` (see `backend/README.md`); that account must change its temporary password at first sign-in.

The scripts call `./node_modules/.bin/*` directly, and `npm test` runs in a temporary mirror, because this repository's
path contains a `:` which Vite/Vitest cannot handle (see `scripts/run-tests.mjs`, `vite.config.ts`).

## Layout

`src/api` (client, generated types) - `src/app` (routes, route config, guards, role switch, providers) - `src/features/*`
(auth, permissions, people, tasks, projects, leave, eod, attendance, service, attachments, dashboard, profile) -
`src/components/{ui,data,feedback,layout}` - `src/lib` (dates, labels, forms, geolocation, URL params) - `src/test` (MSW double, fixtures, render helper).
