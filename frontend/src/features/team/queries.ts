import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'
import { useAuth } from '@/features/auth/authContext'
import { useCan } from '@/features/permissions/usePermissions'

export type Person = Schema<'UserResponse'>
export type HierarchyNode = Schema<'HierarchyNode'>
export type WorkloadRow = Schema<'WorkloadRow'>
export type StatusCount = Schema<'StatusCount'>

export interface UserFilters {
  search?: string
  role?: string
  is_active?: boolean
  manager_id?: string
  page: number
  page_size: number
}

/** People the caller may see: self, the reporting subtree, plus branches opened by `view_manager_team` grants. */
export function useVisibleUsers(filters: UserFilters, enabled = true) {
  return useQuery({
    queryKey: ['users', 'list', filters],
    queryFn: ({ signal }) =>
      api.get<Schema<'UserListResponse'>>('/users', { query: { ...filters }, signal }),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function usePerson(id: string) {
  return useQuery({
    queryKey: ['users', 'detail', id],
    queryFn: ({ signal }) => api.get<Person>(`/users/${id}`, { signal }),
  })
}

/**
 * The caller's own reporting subtree (direct and indirect reports) - exactly the people the
 * manager may manage, as opposed to people merely visible through a read-only grant.
 */
export function useSubtree() {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['users', 'subordinates', user?.id],
    queryFn: ({ signal }) => api.get<Person[]>(`/users/${user?.id}/subordinates`, { signal }),
    enabled: user?.role === 'manager',
    staleTime: 5 * 60_000,
  })
  const ids = useMemo(() => new Set((query.data ?? []).map((person) => person.id)), [query.data])
  return { people: query.data ?? [], ids, isLoading: query.isLoading, query }
}

export function useHierarchy() {
  return useQuery({
    queryKey: ['hierarchy'],
    queryFn: ({ signal }) => api.get<HierarchyNode[]>('/hierarchy', { signal }),
    staleTime: 60_000,
  })
}

/** One row per in-scope person: open tasks and active service assignments. */
export function useWorkload() {
  return useQuery({
    queryKey: ['reports', 'workload'],
    queryFn: ({ signal }) => api.get<WorkloadRow[]>('/reports/workload', { signal }),
    staleTime: 60_000,
  })
}

export function useTaskSummary(projectId?: string) {
  return useQuery({
    queryKey: ['reports', 'tasks', projectId ?? null],
    queryFn: ({ signal }) =>
      api.get<Schema<'TaskReportResponse'>>('/reports/tasks', {
        query: projectId ? { project_id: projectId } : {},
        signal,
      }),
    staleTime: 30_000,
  })
}

export function useServiceSummary(managerId?: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['reports', 'service-activity', managerId ?? null],
    queryFn: ({ signal }) =>
      api.get<Schema<'ServiceActivityReportResponse'>>('/reports/service-activity', {
        query: managerId ? { manager_id: managerId } : {},
        signal,
      }),
    staleTime: 30_000,
  })
}

export function countOf(rows: readonly StatusCount[] | undefined, ...statuses: string[]): number | undefined {
  if (!rows) return undefined
  return rows.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row.count, 0)
}

export interface PersonOption {
  value: string
  label: string
}

export const personLabel = (person: Pick<Person, 'name' | 'designation'>, suffix = '') =>
  `${person.name}${suffix}${person.designation ? ` · ${person.designation}` : ''}`

/** Everyone the manager can see, for read-only filters ("tasks of ..."). */
export function useVisiblePeopleOptions() {
  const { user } = useAuth()
  const query = useVisibleUsers({ is_active: true, page: 1, page_size: 100 })
  const options: PersonOption[] = (query.data?.items ?? []).map((person) => ({
    value: person.id,
    label: personLabel(person, person.id === user?.id ? ' (you)' : ''),
  }))
  return { options, people: query.data?.items ?? [], query }
}

/**
 * The people the caller may put on work: a Manager gets themself and their reporting subtree; the
 * Owner gets every active person (the first 100, name order). Options only - the server decides.
 */
export function useTeamOptions() {
  const { user } = useAuth()
  const subtree = useSubtree()
  const everyone = useVisibleUsers({ is_active: true, page: 1, page_size: 100 }, user?.role === 'owner')

  const options = useMemo(() => {
    if (!user) return []
    const people = new Map<string, PersonOption>()
    if (user.role === 'owner') {
      for (const person of everyone.data?.items ?? []) {
        people.set(person.id, { value: person.id, label: personLabel(person, person.id === user.id ? ' (you)' : '') })
      }
      return [...people.values()]
    }
    people.set(user.id, { value: user.id, label: personLabel(user, ' (you)') })
    for (const person of subtree.people) {
      if (person.is_active) people.set(person.id, { value: person.id, label: personLabel(person) })
    }
    return [...people.values()]
  }, [user, subtree.people, everyone.data])

  return { options, isLoading: user?.role === 'owner' ? everyone.isLoading : subtree.isLoading }
}

/**
 * Managers who may be made responsible for a service call: the Owner can pick any active manager
 * (or themself); a Manager can pick themself or a manager in their own reporting line.
 */
export function useManagerOptions() {
  const { user } = useAuth()
  const subtree = useSubtree()
  const managers = useVisibleUsers({ role: 'manager', is_active: true, page: 1, page_size: 100 }, user?.role === 'owner')
  const options = useMemo(() => {
    if (!user) return []
    const people = new Map<string, PersonOption>()
    people.set(user.id, { value: user.id, label: personLabel(user, ' (you)') })
    const pool = user.role === 'owner' ? (managers.data?.items ?? []) : subtree.people.filter((person) => person.role === 'manager' && person.is_active)
    for (const person of pool) if (!people.has(person.id)) people.set(person.id, { value: person.id, label: personLabel(person) })
    return [...people.values()]
  }, [user, managers.data, subtree.people])
  return { options, isLoading: user?.role === 'owner' ? managers.isLoading : subtree.isLoading }
}

/**
 * People a task can be assigned to: `useTeamOptions` plus, for a Manager, other managers the
 * Owner has explicitly allowed (`assign_tasks_to_manager`, one grant per target manager).
 * The server re-checks every assignment.
 */
export function useAssignableUsers() {
  const { user } = useAuth()
  const can = useCan()
  const team = useTeamOptions()
  const managers = useVisibleUsers({ role: 'manager', is_active: true, page: 1, page_size: 100 }, user?.role === 'manager')

  const options = useMemo(() => {
    const people = new Map<string, PersonOption>(team.options.map((option) => [option.value, option]))
    if (user?.role === 'manager') {
      for (const person of managers.data?.items ?? []) {
        if (!people.has(person.id) && can('assign_tasks_to_manager', { type: 'user', id: person.id })) {
          people.set(person.id, { value: person.id, label: personLabel(person) })
        }
      }
    }
    return [...people.values()]
  }, [user, team.options, managers.data, can])

  return { options, isLoading: team.isLoading }
}

export function useUpdatePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Schema<'UserUpdateRequest'> }) =>
      api.patch<Person>(`/users/${id}`, input),
    onSuccess: (person) => {
      queryClient.setQueryData(['users', 'detail', person.id], person)
      void queryClient.invalidateQueries({ queryKey: ['users', 'list'] })
      void queryClient.invalidateQueries({ queryKey: ['people'] })
    },
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, temporary_password }: { id: string; temporary_password: string }) =>
      api.post<void>(`/users/${id}/reset-password`, { temporary_password }),
  })
}
