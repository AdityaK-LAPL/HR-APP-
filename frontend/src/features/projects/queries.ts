import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'

export type Project = Schema<'ProjectResponse'>
export type ProjectMember = Schema<'ProjectMemberResponse'>

export const projectKeys = {
  list: (f: ProjectFilters) => ['projects', 'list', f] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
  members: (id: string) => ['projects', 'members', id] as const,
}

export interface ProjectFilters {
  status?: string
  page: number
  page_size: number
}

export function useProjects(filters: ProjectFilters) {
  return useQuery({
    queryKey: projectKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get<Schema<'ProjectListResponse'>>('/projects', { query: { ...filters }, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useProject(id: string | null | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? ''),
    queryFn: ({ signal }) => api.get<Project>(`/projects/${id}`, { signal }),
    enabled: Boolean(id),
    // A task may belong to a project the caller cannot open (404): that is not worth retrying.
    retry: false,
  })
}

export function useProjectMembers(id: string) {
  return useQuery({
    queryKey: projectKeys.members(id),
    queryFn: ({ signal }) => api.get<ProjectMember[]>(`/projects/${id}/members`, { signal }),
  })
}
