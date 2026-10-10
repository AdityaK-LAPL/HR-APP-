import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'

export type Project = Schema<'ProjectResponse'>
export type ProjectMember = Schema<'ProjectMemberResponse'>

export const projectKeys = {
  list: (f: ProjectFilters) => ['projects', 'list', f] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
  members: (id: string) => ['projects', 'members', id] as const,
}

export type ProjectInput = Schema<'ProjectCreateRequest'>
export type ProjectPatch = Schema<'ProjectUpdateRequest'>

export interface ProjectFilters {
  status?: string
  manager_id?: string
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

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProjectInput) => api.post<Project>('/projects', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
}

/** Omitted fields are unchanged (the API cannot clear a field). `is_active: false` archives. */
export function useUpdateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProjectPatch }) => api.patch<Project>(`/projects/${id}`, patch),
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(project.id), project)
      void queryClient.invalidateQueries({ queryKey: ['projects', 'list'] })
    },
  })
}

export function useAddProjectMember(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Schema<'ProjectMemberAddRequest'>) =>
      api.post<ProjectMember>(`/projects/${projectId}/members`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) }),
  })
}

export function useRemoveProjectMember(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.delete<void>(`/projects/${projectId}/members/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) }),
  })
}
