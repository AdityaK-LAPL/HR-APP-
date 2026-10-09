# Permission Model

Status: **Implemented and verified against a live Supabase database** — every rule below is live code (service layer) and live RLS policy, not a plan. See §10 for the security audit performed against the real database, including one real fix.

Design principle from `context.md` §12: `User → Role → Reporting Hierarchy → Permission Scope`, with explicit Owner-controlled overrides layered on top. Authorization is never implemented by hiding frontend buttons; every rule below is enforced server-side (FastAPI service layer) and mirrored in PostgreSQL Row Level Security as a second, independent layer.

## 1. Roles

Three roles only, stored on `users.role`: `owner`, `manager`, `employee`. A "Manager" and "Senior Manager" are the same role value — seniority comes purely from position in the hierarchy tree (`users.manager_id`), not a separate role.

- **Owner**: implicit full access to every record and every action. Not implemented as "a manager with a big permission list" — checked first and short-circuits all other rules.
- **Manager**: full Employee-level access to their own data, plus scoped access to their subtree (direct and indirect reports), plus whatever cross-scope access the Owner explicitly grants.
- **Employee**: access to their own records only, plus whatever an assignment (task, project membership, service assignment) explicitly grants them visibility into.

## 2. Reporting Hierarchy

`users.manager_id` forms a tree of arbitrary depth:

```
Owner
 └─ Senior Manager
     └─ Manager
         ├─ Employee
         └─ Employee
```

The **transitive closure** of this tree is materialized in `manager_hierarchy_closure` (ancestor_id, descendant_id, depth), maintained by a trigger whenever `manager_id` changes so that "is B in A's subtree" is an O(1) indexed lookup rather than a recursive query repeated on every request/RLS check.

Default (no override) scope rule: **a Manager may access a record belonging to user U if and only if U is themselves, or U appears as a descendant of the Manager in `manager_hierarchy_closure`.**

## 3. Permission Catalog

`permission_definitions` holds the named permissions the Owner can grant or deny beyond the default hierarchy rule. Initial set (extensible without a schema change — just a new row):

| Key | Meaning |
|---|---|
| `view_manager_team` | View a peer/other Manager's list of direct reports |
| `view_manager_reports` | View a peer/other Manager's EOD reports, tasks, attendance |
| `assign_tasks_to_manager` | Create/assign tasks targeted at another Manager |
| `view_subordinate_manager_calendar` | See a subordinate Manager's team calendar entries |
| `modify_project` | Edit a project's fields/status (vs. view-only) |
| `create_project` | Create new projects |
| `delete_archive_project` | Archive/deactivate a project |
| `assign_employees_to_project` | Add/remove project members |
| `assign_employees_to_service_call` | Assign/reassign employees on a service call whose *responsible manager* is someone else. **Implemented (Phase 5) with `scope_type='user'`, `scope_id` = that responsible manager's id** — mirroring `assign_tasks_to_manager` — not a per-call scope, since context.md frames this as "Manager A can act on Manager B's calls" rather than one specific call. |

Each has a **role default** in `role_permissions` (e.g. Managers default-allow `create_project`, `modify_project` for projects they own; default-deny `view_manager_reports` for a peer Manager's data — that requires an explicit grant).

## 4. Owner-Configured Overrides

`permission_grants` rows express exactly the examples in `context.md` §12:

| Scenario | Row shape |
|---|---|
| "Manager A can see Manager B's reports" | `grantee=A, permission_key=view_manager_reports, scope_type=user, scope_id=B, effect=allow` |
| "Manager A cannot see Manager B's reports" | Either no grant (if not covered by default hierarchy — A is not B's ancestor, so default already denies), or an explicit `effect=deny` row if A *would* otherwise have access (e.g. A is B's ancestor but Owner wants to carve out an exception) |
| "Manager A can assign tasks to Manager B" | `grantee=A, permission_key=assign_tasks_to_manager, scope_type=user, scope_id=B, effect=allow` |
| "Manager A can modify a project" vs "view only" | `grantee=A, permission_key=modify_project, scope_type=project, scope_id=<project>, effect=allow` (absence ⇒ view-only) |
| "Manager A can assign employees to a project" | `grantee=A, permission_key=assign_employees_to_project, scope_type=project, scope_id=<project>, effect=allow` |

Grants are additive by default; an explicit `deny` grant always overrides both the default hierarchy rule and any `allow` grant, so the Owner can carve out exceptions in either direction. Grants can be time-boxed (`expires_at`) and are soft-revoked (`revoked_at`), never deleted, preserving a history of who could access what and when — itself useful during audits.

## 5. Evaluation Algorithm

Run identically in the FastAPI service layer (primary enforcement, with clear 403 responses) and expressed as SQL predicates in RLS policies (secondary/defense-in-depth enforcement):

```
function can_access(actor, permission_key, target_scope):
    if actor.role == 'owner':
        return ALLOW

    # 1. Explicit deny always wins
    if exists grant(actor, permission_key, target_scope, effect='deny', not expired, not revoked):
        return DENY

    # 2. Explicit allow
    if exists grant(actor, permission_key, target_scope, effect='allow', not expired, not revoked):
        return ALLOW

    # 3. Default hierarchy rule (self or descendant)
    if target_scope.owner_user_id == actor.id:
        return ALLOW
    if closure_contains(ancestor=actor.id, descendant=target_scope.owner_user_id):
        return ALLOW

    # 4. Role default table (feature-level, not record-level, e.g. "can employees create tasks at all")
    if role_permissions[actor.role, permission_key] == allow:
        return ALLOW

    return DENY
```

Notes:
- Step 3 is what makes a Manager automatically see their own subtree without needing any explicit grant row per employee — grants exist only for the *exceptions* (cross-branch visibility, cross-manager task assignment), keeping the grants table small and intentional rather than a row-per-employee mess.
- "target_scope.owner_user_id" resolves differently per entity: for a task it's `assigned_to`; for an EOD report it's `user_id`; for a leave request it's `employee_id`; for a service call there is no single owning employee, so the check instead walks `service_assignments` (is the actor the responsible manager, an assigned employee, or an ancestor of one).

## 6. Row Level Security (RLS)

RLS is enabled on every sensitive table as a **second, independent enforcement layer** — it must never be the only layer, since it can't produce good error messages or run cross-table business validation, but it protects against any bug or bypass in the API layer (including a stray direct Postgres/Supabase-Studio query).

Because authentication is custom (see `architecture.md` §4), each request's FastAPI-owned DB transaction sets Postgres GUCs after verifying the JWT:

```sql
SET LOCAL app.user_id = '<uuid>';
SET LOCAL app.user_role = 'manager';
```

A helper function wraps these for policy readability:

```sql
CREATE FUNCTION current_app_user_id() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$ LANGUAGE sql STABLE;

CREATE FUNCTION current_app_user_role() RETURNS text AS $$
  SELECT current_setting('app.user_role', true)
$$ LANGUAGE sql STABLE;
```

**Implementation note (Phase 2):** login and refresh-token rotation need to read `users`/`user_credentials`/`sessions` *before* any authenticated identity exists (that's the whole point of login). Rather than adding a service-role bypass outside the GUC mechanism, the auth service bootstraps with a reserved role value, `'system'`, that appears in policies alongside `'owner'` (e.g. `current_app_user_role() IN ('system', 'owner')`). This value is never derived from client input — it is set only by trusted server-side code in `app/services/auth_service.py`, exclusively for the login/refresh lookup, and the RLS context is immediately re-set to the real authenticated user's id/role as soon as one is established. Every table's RLS is also declared with `FORCE ROW LEVEL SECURITY`, so policies apply even to the table-owning role — except an actual Postgres **superuser**, which always bypasses RLS regardless of policies or FORCE; this is a Postgres invariant, not something policies can override. Production deployments must therefore connect as a non-superuser role for RLS to provide real defense-in-depth on top of the service-layer checks (see `architecture.md` §4 and `database.md` migration `0002`).

**Implementation note (Phase 3):** rather than duplicating the hierarchy-and-grants logic inline in every table's policy, migration `0004` adds two reusable SQL functions that mirror `app/services/permission_service.py` exactly: `current_app_in_scope(target uuid)` (the default hierarchy rule — owner/system, self, or a descendant) and `current_app_can_access(permission_key, scope_type, scope_id)` (the full deny > allow > hierarchy > role-default evaluation). Every Phase 3 table's policy is built from these two functions. The actual `tasks` SELECT policy:

```sql
CREATE POLICY tasks_select ON tasks FOR SELECT USING (
    current_app_user_role() IN ('system', 'owner')
    OR assigned_to = current_app_user_id()
    OR assigned_by = current_app_user_id()
    OR current_app_in_scope(assigned_to)
);
```

and its `INSERT` policy, which additionally allows the `assign_tasks_to_manager` grant path for cross-manager assignment:

```sql
CREATE POLICY tasks_insert ON tasks FOR INSERT WITH CHECK (
    current_app_user_role() IN ('system', 'owner')
    OR assigned_to = current_app_user_id()
    OR current_app_in_scope(assigned_to)
    OR (
        current_app_user_role() = 'manager'
        AND current_app_can_access('assign_tasks_to_manager', 'user', assigned_to)
    )
);
```

Every table listed in `database.md` gets an analogous `SELECT` policy (and stricter `INSERT`/`UPDATE` policies limited to the service-layer's own connection role, since row *creation* usually has business rules beyond scope — e.g. "a Manager may only create a task assigned to someone in their subtree" — that belong in the service layer with RLS as a backstop `WITH CHECK` clause mirroring the same predicate).

## 7. Worked Examples (from `context.md` §12)

| Requirement | How it's enforced |
|---|---|
| Manager A can see Manager B's reports | `permission_grants` row, `allow`, checked in step 2 before falling through to hierarchy |
| Manager A cannot see Manager B's reports | No grant + B not in A's closure ⇒ default deny (step 3 fails) ⇒ falls to step 4 role default (deny) |
| Manager A can assign tasks to Manager B | `assign_tasks_to_manager` allow grant scoped to B; without it, task-assignment service rejects even though A might technically outrank B elsewhere |
| Manager A can see Manager B's team | `view_manager_team` allow grant scoped to B |
| Manager A can modify a project | `modify_project` allow grant scoped to that project; otherwise Manager gets read-only access if they're a project member/owner, or no access at all |
| Manager A can assign employees to a project | `assign_employees_to_project` allow grant scoped to that project |

## 8. Testing Checklist (maps to the automated tests required by the task brief)

1. Employee cannot read another employee's tasks/EOD/leave/attendance (self-scope only).
2. Manager can read data for users in their subtree (direct and multi-level indirect reports).
3. Manager cannot read data for users outside their subtree without an explicit grant.
4. An explicit `deny` grant overrides what the hierarchy would otherwise allow.
5. An explicit `allow` grant unlocks access the hierarchy would otherwise deny (cross-branch Manager-to-Manager visibility).
6. Owner can read/write everything regardless of hierarchy or grants.
7. Deactivating a Manager does not delete their historical grant records or reassign their reports automatically (reassignment is a separate, explicit Owner action).
8. Leave approval: only the employee's current approver (per `leave_requests.current_approver_id`) — or Owner — can approve/reject; approving out of turn is rejected even via direct API call.
9. Service call access: assigned employees, the responsible manager, ancestors of the responsible manager/assigned employees, and Owner can view; unrelated Managers/Employees cannot, absent a grant.
10. Deactivating a user/customer/machine/project does not remove any historical record that references it (query still returns tasks/reports/service history).
11. RLS policies independently reject a query that the service layer would also reject (tested by querying with the Postgres role directly, bypassing FastAPI, to confirm the DB-level backstop actually holds).

## 9. Open Questions

- Confirm whether "Manager A cannot see Manager B's reports" should ever need an *explicit deny* row in practice, or whether it is always just "absence of allow" — this affects whether the Owner's permissions UI needs a deny toggle or only an allow toggle per relationship. Current design supports both; defaulting the UI to allow-only (simpler) is a reasonable Phase 3 starting point unless business needs the deny case immediately.
- Confirm whether project-level grants (`modify_project`, `assign_employees_to_project`) should also implicitly cover all tasks within that project, or remain project-metadata-only (task assignment already covered separately by task-specific rules). Current design keeps them separate and explicit.

## 10. Security Audit Findings (live Supabase database)

A dedicated security/authorization audit was performed against the real, migrated Supabase database (all 26 business tables + `alembic_version`), covering RLS enablement, policy correctness, Supabase's default `anon`/`authenticated` PostgREST grants, audit-log immutability, and storage security. Full detail and the complete finding-by-finding table are in `docs/development-status.md`'s security audit section; the summary that belongs here, in the permission model's own document, is:

- **RLS coverage**: all 26 business tables have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. Confirmed directly against `pg_class` on the live database, not just by re-reading the migrations.
- **(Superseded by migration `0013`: those grants are now revoked.) Supabase's `anon`/`authenticated` roles held full table-level grants on every table** (Supabase's default schema-wide grant, applied automatically — not something this project's migrations requested). This sounds alarming in isolation, but RLS being forced means table-level grants are necessary-but-not-sufficient: a row is only actually reachable if some policy's boolean evaluates to `TRUE` for the connection's `current_app_user_role()`/`current_app_user_id()` GUCs. Since this app's own connection is the only thing that ever sets those GUCs (`app/db/session.py:set_rls_context`), a raw `anon`/`authenticated` PostgREST request has both GUCs `NULL`, and no policy in this schema ever resolves `TRUE` for a `NULL` role. Verified directly with `SET ROLE anon`/`SET ROLE authenticated` (no GUC set) against every table: every `SELECT` returns 0 rows, every `INSERT`/`DELETE` attempted is rejected or affects 0 rows. **No policy needed to change for this** — it already worked correctly; recommend as a follow-up (not yet done) to also explicitly `REVOKE ALL ... FROM anon, authenticated` on these tables as pure defense-in-depth, since this app never uses Supabase's auto-generated REST API and has no reason for those roles to hold any grant at all.
- **RLS recursion bug found and fixed** (migration `0011`): `service_calls`'s SELECT/UPDATE policies and `service_assignments`'s SELECT/write policies each embedded a raw correlated `EXISTS` into the other table — a genuine mutual RLS dependency cycle. The identical shape existed between `projects` and `project_members`. This never leaked data (no policy branch ever resolves `TRUE` for a `NULL`-role connection, so the only failure modes were "0 rows" or a hard `infinite recursion detected in policy` SQL error), and real authenticated traffic (owner/manager/employee, always with GUCs set) never hit it either, which is why all 112 tests passed before this was found — it only manifested for a connection with no RLS context set at all, i.e. exactly the anon/authenticated case above. Fixed by extracting each cross-table lookup into a `SECURITY DEFINER` helper function (owned by the migration-running role, which has `BYPASSRLS`), so the lookup no longer re-triggers the calling table's own policy. Full pytest suite re-run afterward: 112 passed, 0 failed, confirming no behavior change for real users.
- **Audit-log immutability verified at the RLS layer directly**, not just by re-reading the trigger: `audit_logs` has a `SELECT` and an `INSERT` policy and **no `UPDATE`/`DELETE` policy at all** — Postgres's RLS default-deny-per-command means neither Owner nor any other role can update/delete a row via SQL, on top of the separate `BEFORE UPDATE OR DELETE` trigger that unconditionally raises. Confirmed empirically: an attempted `DELETE FROM audit_logs` as `anon` reports `0` affected rows, and the table's row count is provably unchanged before/after.
- **Permission-precedence algorithm (deny > allow > hierarchy > role-default) confirmed identical in both enforcement layers** by reading `app/services/permission_service.py::has_permission` and the SQL function `current_app_can_access()` side by side — both check deny first (short-circuiting), then allow, then `scope_type='user'` hierarchy default, then the `role_permissions` catalog default, in that exact order.

### 10.1 Correction and RLS enforcement (2026-10-06)

The §10 findings above held for the PostgREST roles and for the policy text, but at that time the backend connected as the `BYPASSRLS` `postgres` role, so the policies were **not applied to the application's own queries**. Migrations `0013`-`0015` fixed this: the app now runs each request transaction as the `NOBYPASSRLS` role `hr_app_rls` (`SET LOCAL ROLE` semantics via `set_config('role', ..., true)`), `anon`/`authenticated` hold no grants, three policy bugs found by enforcement were fixed (leave decisions, grant-based project visibility, target-user validation via the narrow `app_user_stub()`), and hierarchy-scope policies were rewritten set-based for performance. Records outside the caller's visibility now return 404 (existence not revealed). Details: `development-status.md`, "RLS enforcement on application traffic".

## 11. Manager-visibility permissions (enforced, migration 0016)

`view_manager_team`, `view_manager_reports` and `view_subordinate_manager_calendar` were catalogued but not enforced until 2026-10-09. They are now evaluated by the database function `app_visible_user_ids(kind)` and used by every affected SELECT policy and by the matching service-layer queries (`permission_service.visible_user_ids` / `can_view_user`), so both layers always agree.

For a caller C and kind K: **visible users = {C} ∪ subtree(C) ∪ ⋃ subtree(B) over active `allow` grants (permission for K, `scope_type=user`, `scope_id=B`) − ⋃ subtree(D) over active `deny` grants**. Owner sees everyone. Interpretation chosen where the spec was ambiguous: *a grant scoped to manager B covers B and B's whole branch* — the same set B would see — and *deny removes the target's whole branch, including from the grantee's own hierarchy* (the "A is B's ancestor but the Owner wants an exception" case in §4). Kinds: `team` = user profiles/hierarchy; `reports` = EOD reports, tasks, attendance; `calendar` = team-calendar entries (a service-layer scope; the underlying rows must also be readable under RLS). Leave and service-management visibility keep their existing rules. Only SELECT policies changed: viewing never implies write access. Tested in `tests/test_visibility_grants.py` (direct RLS + HTTP).

Also now in place: `GET /permissions/me` (the caller's own role defaults and active grants) and server-enforced forced password change (`403 password_change_required` until `change-password`).
