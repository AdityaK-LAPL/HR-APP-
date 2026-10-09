import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api } from '@/api/client'
import type { MyPermissions } from '@/api/types'
import { useAuth } from '@/features/auth/authContext'
import { evaluatePermission, type PermissionScope } from './evaluate'

export function usePermissions() {
  const { status, user } = useAuth()
  return useQuery({
    queryKey: ['permissions', 'me'],
    queryFn: ({ signal }) => api.get<MyPermissions>('/permissions/me', { signal }),
    // The endpoint is blocked while a password change is pending.
    enabled: status === 'authenticated' && user?.must_reset === false,
    staleTime: 5 * 60_000,
  })
}

/** `can(key, scope?)`: UX hint from the caller's own grants/defaults. The server still decides. */
export function useCan() {
  const { data } = usePermissions()
  return useCallback(
    (key: string, scope?: PermissionScope) => evaluatePermission(data, key, scope),
    [data],
  )
}
