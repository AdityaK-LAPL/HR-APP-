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

  const applies = (grant: MyPermissions['grants'][number]) => {
    if (grant.permission_key !== key) return false
    if (grant.scope_type === 'global') return true
    if (!scope) return false
    return grant.scope_type === scope.type && (grant.scope_id ?? null) === (scope.id ?? null)
  }
  const matching = permissions.grants.filter(applies)

  if (matching.some((grant) => grant.effect === 'deny')) return false
  if (matching.some((grant) => grant.effect === 'allow')) return true
  return permissions.role_defaults.find((d) => d.permission_key === key)?.allow ?? false
}
