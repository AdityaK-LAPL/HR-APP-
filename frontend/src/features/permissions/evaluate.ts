import type { MyPermissions } from '@/api/types'

export interface PermissionScope {
  type: 'user' | 'team' | 'project' | 'global'
  id?: string | null
}

/**
 * What the caller's OWN permission configuration says about `key` - a hint for showing or
 * hiding controls, never a security decision (the server decides).
 *
 * Order, as documented in docs/permissions.md: explicit deny > explicit allow > role default.
 * The reporting-hierarchy default ("a manager may act on their own subtree") needs data this
 * hook does not have, so it is NOT modelled: absence of an answer is `false`, and screens
 * should prefer facts on the record itself (e.g. "I am this leave's approver") over this.
 */
export function evaluatePermission(
  permissions: MyPermissions | undefined,
  key: string,
  scope?: PermissionScope,
): boolean {
  if (!permissions) return false
  if (permissions.unrestricted) return true

  // The server matches a grant only on the exact (scope type, scope id) pair it asks about -
  // a `global` grant does not stand in for a project or user scope - so the hint does the same.
  const asked = { type: scope?.type ?? 'global', id: scope?.id ?? null }
  const applies = (grant: MyPermissions['grants'][number]) =>
    grant.permission_key === key && grant.scope_type === asked.type && (grant.scope_id ?? null) === asked.id
  const matching = permissions.grants.filter(applies)

  if (matching.some((grant) => grant.effect === 'deny')) return false
  if (matching.some((grant) => grant.effect === 'allow')) return true
  return permissions.role_defaults.find((d) => d.permission_key === key)?.allow ?? false
}
