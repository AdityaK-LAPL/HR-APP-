import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'

export type Leave = Schema<'LeaveResponse'>
export type LeaveInput = Schema<'LeaveCreateRequest'>

export interface LeaveFilters {
  status?: string
  employee_id?: string
  page: number
  page_size: number
}

export function useLeaves(filters: LeaveFilters) {
  return useQuery({
    queryKey: ['leaves', 'list', filters],
    queryFn: ({ signal }) =>
      api.get<Schema<'LeaveListResponse'>>('/leaves', { query: { ...filters }, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useApplyLeave() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LeaveInput) => api.post<Leave>('/leaves', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaves'] }),
  })
}

export function useCancelLeave() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Leave>(`/leaves/${id}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaves'] }),
  })
}

/** Approve or reject a request the caller is the approver for (the server checks that). */
export function useDecideLeave() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision, comments }: { id: string; decision: 'approve' | 'reject'; comments: string | null }) =>
      api.post<Leave>(`/leaves/${id}/${decision}`, { comments }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leaves'] })
      void queryClient.invalidateQueries({ queryKey: ['calendar'] })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
