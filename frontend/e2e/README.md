# End-to-end audits

Real-browser and real-API audits that drive the whole stack - nothing is mocked: the production build
(`vite preview`, which proxies `/api`) in front of the FastAPI backend and the real database.
Introduced in Prompt 14 (the frontend <-> backend integration audit).

| Script | What it covers |
|---|---|
| `api-audit.mjs` | Role-separated HTTP audit: authentication (login, refresh rotation and replay, expiry, tampering, CSRF, forced password change, deactivation), every Employee / Manager / Owner workflow, and the security matrix (employee vs manager/owner pages, manager A vs manager B, employee vs another employee, unauthenticated calls). |
| `ui-audit.mjs` | The same roles through the browser: sign-in/out, refresh, back/forward, every workflow with the real buttons, URLs typed by hand, slow / dropped / failing networks, the installed service worker offline, and desktop / tablet / phone layouts with axe-core (WCAG A/AA), horizontal-scroll and 44 px touch-target checks. `E2E_ONLY=auth,employee,manager,owner,network,layout` runs a subset; `E2E_LIVE=1` prints each result as it happens. |
| `authz-sweep.mjs` | Every operation in `docs/openapi.json` called as a visitor, an Employee and a Manager of branch A against records of branch B (bodies generated from the schemas so the request reaches the authorization check): branch B must be unreachable, Owner-only operations must refuse everyone else, lists must show nothing of the other branch. `npm run e2e:authz`. |
| `csp-check.mjs` | Signs in as each role under the production build's real content-security policy (`vite preview` sends it) and fails on any blocked resource. `npm run e2e:csp`; set `E2E_REUSE` to a data file written from `seedCompany()`. |
| `uat-rehearsal.mjs` | Dress rehearsal for `docs/uat`: builds the UAT cast (Owner, two managers, three employees, customer, machine, call, leave) and walks the scenarios whose screen texts the other audits do not prove, checking the exact wording the scenario sheet promises. Needs a database with only the Owner |
| `reports-xlsx.mjs` | The attendance-reports feature end to end: work mode at punch-in, half-day / comp-off leave, the four Excel downloads (opened and read back with openpyxl: names, content, no formulas, hostile names), the Owner-granted `download_company_reports` permission (grant, revoke, deny, other branch), company settings and holidays, and the Attendance analytics / Company settings screens in a real browser incl. real file downloads. `npm run e2e:reports`; needs `XLSX_PYTHON` (a python with openpyxl). |
| `lib.mjs` | Shared helpers: the API client (cookies + CSRF + silent refresh), the result matrix and `seedCompany()`, which builds a small company (Owner, two peer branches, tasks, project, leave, EOD, attendance, customer, machine, service call) through the API. |

## Running

```bash
# 1. a fresh database with only the Owner (its known password is what the audits log in with)
cd backend && OWNER_PASSWORD='TempOwner#2026a' python -m scripts.seed_owner      # after truncating the business tables
# 2. the API, with the login rate limit raised (the audits sign in many times)
LOGIN_RATE_LIMIT_MAX=500 uvicorn app.main:app --port 8000
# 3. the production build
cd frontend && npm run build && npm run preview -- --host 127.0.0.1               # http://127.0.0.1:4173
# 4. browsers once, then the audits
npx playwright install chromium
npm run e2e:api
npm run e2e:ui
```

Each run seeds its own company, so start each one from a database that holds only the Owner
(`E2E_BASE` overrides the URL, `OWNER_PASSWORD` the Owner's password). All scripts exit non-zero
when a check fails and print the workflow matrix. Against the remote development database a full
`ui-audit` takes about 40 minutes, because every request is slow.
