import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'
import type { Person } from '@/features/team/queries'

export type Grant = Schema<'PermissionGrantResponse'>
export type GrantInput = Schema<'PermissionGrantCreateRequest'>
export type PermissionDefinition = Schema<'PermissionDefinitionResponse'>
export type AuditLog = Schema<'AuditLogResponse'>
export type UserInput = Schema<'UserCreateRequest'>

// -- users ----------------------------------------------------------------------------------

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UserInput) => api.post<Person>('/users', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      void queryClient.invalidateQueries({ queryKey: ['hierarchy'] })
      void queryClient.invalidateQueries({ queryKey: ['reports', 'workload'] })
    },
  })
}

/** Owner only. `null` removes the manager. The database refuses a change that would create a cycle. */
export function useChangeManager() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string | null }) =>
      api.patch<Schema<'HierarchyNode'>>(`/hierarchy/${id}/manager`, { manager_id: managerId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      void queryClient.invalidateQueries({ queryKey: ['hierarchy'] })
    },
  })
}

// -- permissions ----------------------------------------------------------------------------

export function useDefinitions() {
  return useQuery({
    queryKey: ['permissions', 'definitions'],
    queryFn: ({ signal }) => api.get<PermissionDefinition[]>('/permissions/definitions', { signal }),
    staleTime: 10 * 60_000,
  })
}

export interface GrantFilters {
  grantee_user_id?: string
  permission_key?: string
  scope_type?: string
}

export function useGrants(filters: GrantFilters, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['permissions', 'grants', filters],
    queryFn: ({ signal }) => api.get<Grant[]>('/permissions/grants', { query: { ...filters }, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useCreateGrant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: GrantInput) => api.post<Grant>('/permissions/grants', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['permissions'] })
      void queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
    },
  })
}

/** Grants are soft-revoked (kept for history), never deleted. */
export function useRevokeGrant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/permissions/grants/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['permissions'] })
      void queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
    },
  })
}

// -- audit trail ----------------------------------------------------------------------------

export interface AuditFilters {
  entity_type?: string
  entity_id?: string
  actor_user_id?: string
  action?: string
  start_date?: string
  end_date?: string
  page: number
  page_size: number
}

export function useAuditLogs(filters: AuditFilters) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: ({ signal }) =>
      api.get<Schema<'AuditLogListResponse'>>('/audit-logs', { query: { ...filters }, signal }),
    placeholderData: keepPreviousData,
  })
}

// -- reports --------------------------------------------------------------------------------

export function useAttendanceReport(range: { start_date: string; end_date: string; manager_id?: string }) {
  return useQuery({
    queryKey: ['reports', 'attendance', range],
    queryFn: ({ signal }) =>
      api.get<Schema<'AttendanceReportRow'>[]>('/reports/attendance', { query: { ...range }, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useLeaveSummary() {
  return useQuery({
    queryKey: ['reports', 'leave'],
    queryFn: ({ signal }) => api.get<Schema<'LeaveReportResponse'>>('/reports/leave', { signal }),
    staleTime: 30_000,
  })
}
