# Frontend (React + TypeScript + Vite PWA)

The architecture, conventions and delivery plan live in [`docs/frontend-architecture.md`](../docs/frontend-architecture.md).
The API it consumes is documented in [`docs/api-contract.md`](../docs/api-contract.md) (types come from
[`docs/openapi.json`](../docs/openapi.json)). The backend is authoritative: the frontend holds no business rules.

> Status: the code here is a UI prototype built against a mock backend and is being re-wired to the real API
> phase by phase (Prompts 6-13). Do not treat any page as production-ready until its phase is done.

## Commands

```bash
npm ci
npm run dev      # http://localhost:5173, proxies /api to http://127.0.0.1:8000
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

The scripts call `./node_modules/.bin/*` directly, so they work even though the project path contains a `:`.
Start the API first (`uvicorn app.main:app --reload` in `backend/`) and create the first Owner with
`python -m scripts.seed_owner` (see `backend/README.md`).
