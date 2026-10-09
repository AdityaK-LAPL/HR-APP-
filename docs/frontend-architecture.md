# Frontend Architecture

Status: **Plan (Prompt 5, 2026-10-09) — no feature code written.** Prompts 6–13 implement it. The backend is authoritative: the frontend consumes `docs/api-contract.md` / `docs/openapi.json`, holds no business rules, and never touches PostgreSQL or Supabase directly.

Stack (kept): React 19, TypeScript, Vite 8, React Router 7, `vite-plugin-pwa`, `lucide-react`, oxlint. Stack (added, §3): TanStack Query, react-hook-form, `openapi-typescript`, Vitest + Testing Library + MSW.

---

## 1. What exists today (audit of `frontend/`, ~7,200 lines)

A visually complete prototype (login, shell, 3 dashboards, 13 module pages, 9 UI primitives, PWA config) that was built **against a mock backend**. It is a good UI starting point and an unsafe integration starting point.

| Area | What is there | Verdict |
|---|---|---|
| Design tokens / dark theme (`index.css`) | CSS variables for colour, spacing, radius; responsive breakpoints at 768/1024 | **Keep**, extend (light theme, spacing/typography scale) |
| UI primitives (`components/ui`: Button, Card, Badge, Input, Select, Modal, DataTable, EmptyState, LoadingSkeleton) | Working, consistent look | **Keep & harden** (accessibility, typing, states) |
| Layout (`AppShell`, `DesktopSidebar`, `MobileNavBar`, `Header`) | Desktop sidebar ≥1024px, mobile bottom bar, install banner | **Keep structure**, drive nav from a route config instead of per-role `if`s |
| Feedback (`Toast`, `InstallBanner`) | Toast host, PWA install prompt | **Keep** |
| PWA (`vite.config.ts`, manifest, `autoUpdate` SW) | Manifest + Workbox precache | **Keep**, harden (§13) |
| `apiClient.ts` | `fetch` + `credentials: include` + CSRF header from cookie | **Rewrite** — no refresh handling, drops `error.details`, mock switch inside |
| **Mock layer** (`mockData.ts`, `isMockModeActive`, mock branches in 10 services + 3 pages) | Mock mode **defaults to ON**; services return fake data | **Delete** |
| `authService` / `AuthContext` | Mock login accepts **any password**; server `5xx` silently falls back to a fake "employee" user; identity stored in `localStorage` | **Rewrite** — security defect (a down backend would show a logged-in fake user) |
| `AuthContext.can()` | ~30 hard-coded role rules ("manager can approve_leave", …) | **Delete** — duplicates backend authorization (prohibited); replace with §8 |
| `types/models.ts` (22 interfaces) | Hand-written; **19 of 22 disagree with the API**: ~25 invented fields — mostly display names the API never returns (`assignee_name`, `customer_name`, `user_name`, `project_name`, `approver_name`… see D1) plus `member_count`/`machines_count` — and wrong names (`punch_in_at` vs `punch_in_time`, `file_size_bytes` vs `size_bytes`, task-history `field_name`/`created_at` vs `field_changed`/`changed_at`), and `must_reset` missing. Only 3 types are correct | **Delete** — generate from OpenAPI (§3) |
| `types/enums.ts` | Matches `api-contract.md` §20 | **Replace** with unions generated from OpenAPI (it now publishes enums, D2); keep only label/colour maps |
| Pages (`pages/**`) | Fetch with `useEffect`+`useState`, errors swallowed (`console.error`), no form validation, hard-coded fake IDs (e.g. `assigned_to: 'user-employee'`), Users/AuditLogs/Owner dashboard render mock arrays directly | **Rewrite data layer**, keep layout/visual design as reference |
| Login page | Hard-coded "demo account" buttons (`OWN001` / `MGR001` / `EMP001` + fixed password) | **Remove** |
| Routing | Flat `<Routes>`; `allowedRoles` guards; no lazy loading, no error boundary, no `must_reset` gate | **Restructure** (§4) |
| TypeScript | **`strict` is not enabled**; `noUnused*` off | **Enable strict** (§10) |
| Accessibility | 5 `aria-*`/`role` attributes in the whole app; Modal has no focus trap / Escape handling; viewport meta sets `user-scalable=no` / `maximum-scale=1` (blocks pinch-zoom) | **Fix** (§11) |
| Styling | 348 inline `style={{}}` blocks | **Migrate gradually** to CSS classes/modules; no big-bang rewrite |
| Tests | None | **Add** (§12) |

Nothing in the existing app should be shipped as-is; most of it is re-wired rather than redrawn.

---

## 2. Principles (non-negotiable, from the Prompt 5 brief)

1. No second backend, no frontend-only business rules, no direct PostgreSQL/Supabase access.
2. No invented endpoints, fields or permissions. If the UI needs something the API doesn't return, it is recorded in §15 as a backend dependency, not faked.
3. Frontend permission checks are **UX hints**; the server's `403`/`404` is final. Never infer access from a missing row.
4. No mock mode in production code. Mocks exist only in tests/dev tooling (MSW) and are excluded from the production bundle.
5. No secrets or PII in `localStorage`/`sessionStorage`; tokens live in httpOnly cookies the JS never sees.

---

## 3. Technology decisions

| Concern | Decision | Why |
|---|---|---|
| API types | `openapi-typescript` generates `src/api/schema.d.ts` from `docs/openapi.json` (`npm run gen:api`) | Types cannot drift from the backend; fixes the 19 wrong interfaces at the source. A CI/test check fails if the generated file is stale |
| HTTP | Own thin typed wrapper over `fetch` (~150 lines) | Needs refresh single-flight, CSRF, error normalisation, offline awareness; smaller than adopting a framework |
| Server state | **TanStack Query v5** | Caching, request de-duplication, background refetch, retries, mutation invalidation — replaces the hand-rolled `useEffect` loaders in every page |
| Client state | React context for auth only; component state; **URL search params** for list filters/pagination | No Redux/Zustand: there is almost no client-owned state |
| Forms | **react-hook-form** (uncontrolled, minimal re-renders) | Per-field errors, dirty tracking; server `details[].field` maps straight onto fields. **No zod/yup schemas** — that would duplicate backend validation; client rules are limited to `required`/length/format UX hints |
| Routing | React Router 7 with lazy route modules | Already installed |
| Styling | Existing CSS variables + CSS Modules for new/changed components | Keeps the look; removes inline-style sprawl; no new CSS framework |
| Icons | `lucide-react` (kept) | |
| Charts (Prompt 11 only) | Decide then (lightweight, SVG, themeable) | Not needed earlier |
| Tests | Vitest + React Testing Library + MSW (typed with the generated schema); Playwright arrives in Prompt 14 | |
| Lint/format | oxlint (kept) + `tsc -b` in `npm run build` | |

New dependencies total: `@tanstack/react-query`, `react-hook-form`, `openapi-typescript` (dev), `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `msw` (dev). Each is mainstream and maintained.

---

## 4. Folder structure and routing

```
frontend/src/
  app/                    providers.tsx, router.tsx, route-config.ts, ErrorBoundary.tsx
  api/                    client.ts (fetch wrapper), schema.d.ts (generated), errors.ts, queryClient.ts
  features/
    auth/                 AuthProvider, useAuth, LoginPage, ChangePasswordPage, session.ts
    permissions/          usePermissions (GET /permissions/me), <Can>, nav visibility
    tasks/ projects/ leave/ eod/ attendance/ calendar/
    service/              customers, machines, calls, visits, reports
    users/ hierarchy/ audit/ reports/ notifications/ attachments/
        each feature:  api.ts (typed calls + query keys), hooks.ts (useX/useCreateX…),
                       components/, pages/
  components/
    ui/                   Button, Input, Select, Textarea, Checkbox, DatePicker field, Badge, Card, Tabs…
    data/                 PaginatedTable, CardList, FilterBar, Pagination, StatusBadge
    feedback/             Toast, ConfirmDialog, EmptyState, ErrorState, LoadingSkeleton, OfflineBanner, InstallBanner
    layout/               AppShell, Sidebar, MobileNav, Header, PageHeader
  lib/                    dates.ts, format.ts, a11y.ts, env.ts
  styles/                 tokens.css, base.css, utilities.css
  test/                   msw handlers, render helpers, fixtures
```

**Routing.** One declarative `route-config.ts` is the single source for routes **and** navigation: each entry has `path`, `lazy` page module, `title`, `icon`, `nav` placement, and `roles` (a *display hint* for hiding menu items and redirecting obvious mismatches; the API still decides). Route tree: `/login` (public) → `/change-password` (authenticated, outside the shell, the only screen allowed while `must_reset`) → `/` shell (`ProtectedRoute`) → feature routes (`/tasks`, `/tasks/:id`, `/leaves`, `/service/calls/:id`, …) → `*` NotFound. Each route has an `errorElement`; `403/404` from a detail route renders one shared "Not available" screen (the API deliberately does not distinguish them). Redirect-after-login preserves the original location.

---

## 5. Authentication state

`AuthProvider` owns exactly: `status: 'loading' | 'authenticated' | 'anonymous'`, `user` (`GET /auth/me` shape, **including `must_reset`**), and `login/logout/changePassword`. On app start it calls `GET /auth/me`; `401` → anonymous. **Nothing identity-related is written to browser storage.** `must_reset === true` → router forces `/change-password`; after a successful change the server has revoked all sessions, so the client clears caches and sends the user to `/login`. Logout calls `POST /auth/logout`, clears the query cache, and notifies other tabs via `BroadcastChannel('auth')` so every open tab returns to login. Query cache is never persisted (it holds personal data).

## 6. API client, token/refresh handling

* Same-origin `/api/v1` (Vite dev proxy → `127.0.0.1:8000`; production behind one origin or CORS with credentials). Base URL from `VITE_API_BASE` (default `/api/v1`).
* `credentials: 'include'`; for `POST/PATCH/DELETE` read the `csrf_token` cookie and send `X-CSRF-Token`.
* **401 handling:** the first `401` on any non-auth request triggers **one shared `POST /auth/refresh`** (single-flight promise, so parallel requests don't stampede and rotate the token twice); on success the original requests are retried once; on failure → anonymous + redirect to login with a "session expired" notice. `/auth/login` and `/auth/refresh` themselves never trigger a refresh. `429` on login/refresh shows a back-off message.
* Retries: TanStack Query retries **GET only**, max 2, only for network errors/5xx, never for 4xx. Mutations are never auto-retried (no duplicate side effects).
* Every request gets an `AbortSignal` (navigation cancels in-flight queries) and a 30 s timeout.
* **Offline:** `navigator.onLine` + failed-fetch detection drive an `OfflineBanner`; mutation buttons are disabled with an explanatory tooltip; nothing is queued (no offline sync architecture exists, so we do not pretend).

## 7. Error handling

One `ApiError { status, code, message, fieldErrors?, requestId? }` produced from `{error:{code,message,details?}}`.

| Case | UI |
|---|---|
| `401` after refresh failed | Login screen + "session expired" |
| `403 password_change_required` | Redirect to `/change-password` |
| `403` / `404` on a page load | Shared "Not available to you" screen (never reveals which) |
| `403` / `404` on an action | Toast: "You can't do that" (no raw message dump) |
| `409` | Inline/toast with the server message (e.g. already punched in) |
| `422 validation_failed` with `details` | Map `details[].field` onto form fields; unmatched → form-level alert |
| `422` without `details` (business rule) | Form-level alert with the server message |
| `429` | "Too many attempts, wait a minute" |
| `5xx` / network | Retryable error state with "Try again"; `internal_error` shows the reference id |
| React render error | Route `errorElement` + top-level boundary with reload |

Errors are never swallowed to `console.error`; every query/mutation surfaces state to the UI.

## 8. Permission handling (UX only)

* **Inputs:** `role` from `GET /auth/me`; `GET /permissions/me` (`role_defaults`, active `grants`, `unrestricted`) via `usePermissions()` (cached, refreshed on login and after any grant change).
* **API:** `useCan(permissionKey, scope?)` answers *only* from those two inputs using the documented order (explicit deny > explicit allow > role default); `<Can>` hides or disables controls. It encodes **no** business rules ("manager can approve leave" is *not* modelled — the Approve button shows when the record says the caller is its approver, and the server decides).
* **Navigation:** menu entries filtered by `roles` in `route-config.ts`; direct URL access to a hidden page still works and simply receives the server's `403/404`.
* **Policy:** hide actions the user can never perform (e.g. an Employee's "New task"); disable-with-reason for actions that depend on data state; never rely on UI gating for safety.
* Known limits (API, not UI): the three manager-visibility grants only change *read* scope; the UI shows whatever the API returns.

## 9. Reusable components, forms, lists, dialogs, notifications

**Components.** Keep the nine primitives; add `Textarea`, `Checkbox`, `DateField`, `FormField` (label, hint, error, `aria-describedby`), `Tabs`, `Pagination`, `StatusBadge` (single colour/label map per enum), `ConfirmDialog`, `ErrorState`, `OfflineBanner`, `PageHeader`.

**Forms.** `useForm` + `FormField` + a `useApiForm(mutation)` helper that (a) disables submit while pending (double-submit guard), (b) maps `ApiError.fieldErrors` onto fields, (c) shows a form-level error otherwise, (d) warns on navigating away from a dirty form. Dates are `YYYY-MM-DD` strings end to end; timestamps are ISO and displayed with `Intl.DateTimeFormat` in the user's locale/timezone.

**Tables/lists.** `PaginatedTable<T>` (desktop table) + `CardList<T>` (mobile ≥ <768px) share one column definition. A `useListQuery(resource)` hook keeps `page`, `page_size`, filters in the **URL search params** (shareable, back/forward-safe) and feeds TanStack Query; it understands the three list shapes from api-contract §21 (paginated / `{items}` / bare array). Loading → skeleton rows; empty → `EmptyState` with the filter summary; error → `ErrorState` with retry. No client-side sorting/filtering of server data beyond what the API offers (the API has no sort parameters).

**Dialogs.** One accessible `Dialog` (native `<dialog>` or a focus-trapping portal: focus trap, Esc, scroll lock, return focus, `aria-modal`, labelled) underlies `Modal`, `ConfirmDialog` and the mobile bottom-sheet. Destructive/sensitive actions (deactivate user, archive project, revoke grant, reject leave, delete attachment) always go through `ConfirmDialog` with explicit wording.

**Notifications.** *Toasts* for transient results (existing host, `role="status"`/`alert`). *Notification centre* = bell in the header with unread count from `GET /notifications?unread_only=true`, polled every 60 s and on window focus; panel lists items, `POST /notifications/{id}/read` and `read-all`. Entity navigation uses `payload` keys the backend actually sends (to be confirmed against real data in Prompt 12; unknown types render as plain text, never as guessed links). No push/email/WhatsApp.

## 10. State management and caching

| State | Home |
|---|---|
| Server data | TanStack Query; keys `[resource, scope, filters]` from each feature's `api.ts` |
| Auth/session | `AuthProvider` |
| Filters/pagination/tab | URL search params |
| Form values | react-hook-form |
| Ephemeral UI (dialog open, etc.) | component state |

`staleTime`: reference data (permission definitions, enums-derived lists) 10 min; lists 30 s; detail 30 s; notifications 0 + 60 s poll; auth/permissions 5 min. Mutations invalidate by resource prefix (a per-feature invalidation map is documented next to each mutation). `window focus` refetch on. Cache cleared on logout. **TypeScript `strict: true`, `noUnusedLocals/Parameters: true`** from Prompt 6.

## 11. Responsive layout and accessibility

Breakpoints: `<768` mobile (bottom nav, card lists, bottom-sheet dialogs), `768–1023` tablet (collapsible rail, two-column forms), `≥1024` desktop (sidebar, tables). Touch targets ≥ 44 px; `env(safe-area-inset-*)` for notched devices; no horizontal page scroll; wide admin tables scroll inside their container with a sticky header. **Fix the viewport meta** (remove `maximum-scale`/`user-scalable=no`). Targets: keyboard-operable everything, visible focus rings, labelled controls, `aria-live` for toasts and async results, colour never the only status carrier (icon/text on badges), contrast ≥ 4.5:1 in both themes, `prefers-reduced-motion` respected. Theme: tokens support dark (current) and light via `prefers-color-scheme` with a manual override stored as a non-sensitive preference.

## 12. Testing

Vitest + RTL + MSW handlers generated from the same typed schema. Priorities: (1) API client (refresh single-flight, CSRF, error mapping, offline), (2) auth flows incl. `must_reset`, (3) `PaginatedTable`/`useListQuery`, (4) permission helpers, (5) one happy-path test per feature page. Contract test: the generated `schema.d.ts` equals what `docs/openapi.json` produces (enum equality with the contract is already tested backend-side). `npm run build` stays `tsc -b && vite build`; `npm test` added. Playwright cross-role/cross-device flows are Prompt 14.

## 13. PWA structure

Keep `vite-plugin-pwa` (`generateSW`). Changes: **`registerType: 'prompt'`** (show "Update available — reload" so a deploy never reloads a half-filled form); precache the app shell only; `navigateFallback: '/index.html'` excluding `/api/`; **`/api/*` is `NetworkOnly`** (never cache authenticated data in the service worker); add 192/512 **PNG** + maskable + Apple touch icons (SVG-only icons fail on iOS/some Android installers); manifest `id`, `lang`, `categories`; the install banner stays. Offline = cached shell + clear offline state + disabled mutations (§6). No claim of offline business functionality.

## 14. Security notes

No `dangerouslySetInnerHTML`; all text rendered as text; file uploads validated client-side for size/extension as UX only (server is the authority: 25 MB, extension and magic-byte checks); no tokens/PII in browser storage; CSP and security headers specified for deployment in Prompt 17; remove demo credentials; error messages shown to users are the server's generic messages.

## 15. Backend dependencies and open decisions found during planning

These are API facts, not frontend bugs. Each is small and additive; none is built yet.

| # | Finding | Impact | Needed by |
|---|---|---|---|
| **D1 — RESOLVED 2026-10-09** | **No way to show a person's name unless you can list them** (the prototype's `*_name` fields assumed the API returned names; it does not). Records carry only IDs (`assigned_by`, `current_approver_id`, `reviewed_by`, `responsible_manager_id`, audit `actor_user_id`…). Owners/Managers can resolve via `GET /users` (their visible set, max 100/page), but an **Employee can only read their own user row**, so "see who assigned the task" (context.md §3.1), "who approved my leave", "who reviewed my service report" cannot be displayed. Customer/project names resolve only for entities the Employee can list. | Employee screens (Prompt 7) | **Prompt 7** |
| D2 — **RESOLVED 2026-10-09** | OpenAPI now publishes `enum` on every enum-valued field (documentation-only post-processing, validation unchanged), so the generated types carry the unions; a backend test keeps them equal to the contract. | Drop hand-written `enums.ts`; use generated unions (derive dropdown option lists from the same constants) | Prompt 6 |
| D3 — **RESOLVED 2026-10-09** | Company timezone is **Asia/Kolkata (IST)**. The backend uses it for attendance days; `GET /config` returns `{company_timezone, utc_offset_minutes, today}`. | Frontend `lib/dates.ts` formats every timestamp and computes "today" in the company timezone (via `Intl` with `timeZone: company_timezone`), never the browser's; default date inputs use `config.today` | Prompt 6 (lib), 7 |
| D4 | `GET /hierarchy` and `/permissions/*` are unpaginated (fine at current scale). | Large orgs | later |
| D5 | Nothing in the backend produces notifications yet, so `type`/`payload` are undefined (api-contract §17). | Build the notification centre against the API and test data; no deep links until producers exist | Prompt 12 |

**D1 resolution (implemented):** `GET /users/directory?ids=<uuid>&ids=<uuid>…` (1–100 ids) returns only `{id, name, employee_code, designation, role, is_active}` for any logged-in user (migration `0017`, same narrow-lookup pattern as `app_user_stub`; UUIDs are unguessable and names are internal-directory data). The frontend resolves every referenced person through one batched, cached `usePeople(ids)` hook; entities (projects, customers, machines) resolve from their own list/detail endpoints. All planning items D1–D3 and D5 are resolved; no business decision is outstanding.

---

## 16. Delivery plan (maps to the prompt list)

| Prompt | Frontend deliverable | Key definition of done |
|---|---|---|
| **6** Foundation + auth | Enable strict; add deps/tooling/tests; generate API types; delete mock layer + `can()` + demo logins + hand types; new `api/client` (refresh, CSRF, errors, offline); `AuthProvider` (`/auth/me`, `must_reset`, logout broadcast); route config + lazy routes + error boundaries; login + change-password screens; shell/nav from config; hardened UI primitives (Dialog, FormField…); PWA foundation changes; viewport/a11y fixes | Real login/logout/refresh/expiry works against the live API; `tsc`, lint, tests, build green; no mock code in the bundle |
| 7 Employee | Tasks, projects, leave, EOD, attendance, profile, service work (assigned calls, visits, reports), attachments | Each flow works against the API with loading/empty/error states; names via `/users/directory` (D1 done); D3 decided first |
| 8 Manager | Team, task assignment, project allocation, leave approval, team EOD/attendance/calendar, service assignment, notifications | Scope shown is exactly what the API returns |
| 9 Owner | Users, hierarchy, permissions (+`/permissions/me` consumers), audit log, admin screens | Only API-supported controls |
| 10 Service | Customer → machine → call → assignment → visit → report workflow, technician mobile flow | |
| 11 Dashboards/reports | From `/reports/*`, `/calendar`; chart library chosen here | |
| 12 Notifications | Centre, unread, deep links (D5) | |
| 13 PWA | Offline shell, update flow, icons, device-size verification | |

**Reuse rule for every phase:** keep the existing visual design and layouts as reference, re-implement data access through `features/*/api.ts` + TanStack Query, and delete the old page code in the same change so no mock path survives.
