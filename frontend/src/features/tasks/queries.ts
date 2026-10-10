import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'

export type Task = Schema<'TaskResponse'>
export type TaskStatus = Task['status']
export type TaskHistoryEntry = Schema<'TaskHistoryEntry'>
type TaskList = Schema<'TaskListResponse'>

export type TaskInput = Schema<'TaskCreateRequest'>
export type TaskPatch = Schema<'TaskUpdateRequest'>

export interface TaskFilters {
  status?: string
  task_date?: string
  assigned_to?: string
  project_id?: string
  page: number
  page_size: number
}

export const taskKeys = {
  all: ['tasks'] as const,
  list: (filters: TaskFilters) => ['tasks', 'list', filters] as const,
  detail: (id: string) => ['tasks', 'detail', id] as const,
  history: (id: string) => ['tasks', 'history', id] as const,
}

export function useTasks(filters: TaskFilters) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get<TaskList>('/tasks', {
        query: { ...filters },
        signal,
      }),
    placeholderData: keepPreviousData,
  })
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: ({ signal }) => api.get<Task>(`/tasks/${id}`, { signal }),
  })
}

export function useTaskHistory(id: string) {
  return useQuery({
    queryKey: taskKeys.history(id),
    queryFn: ({ signal }) => api.get<TaskHistoryEntry[]>(`/tasks/${id}/history`, { signal }),
  })
}

/** An employee may change only `status` on their own tasks (the server enforces it). */
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api.patch<Task>(`/tasks/${id}`, { status }),
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task)
      void queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

/** Managers: create and assign a task (the server checks who the assignee may be). */
export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TaskInput) => api.post<Task>('/tasks', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

/**
 * Managers: edit and/or reassign. The API treats an omitted field as "unchanged" - a field
 * cannot be cleared once set - so callers send only what they changed.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => api.patch<Task>(`/tasks/${id}`, patch),
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task)
      void queryClient.invalidateQueries({ queryKey: taskKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
