import type { ReactNode } from 'react'
import type { PermissionScope } from './evaluate'
import { useCan } from './usePermissions'

/** Renders children only when the caller's own permission configuration allows `permission`. */
export function Can({
  permission,
  scope,
  children,
  fallback = null,
}: {
  permission: string
  scope?: PermissionScope
  children: ReactNode
  fallback?: ReactNode
}) {
  const can = useCan()
  return <>{can(permission, scope) ? children : fallback}</>
}
