import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'

export type Leave = Schema<'LeaveResponse'>
export type LeaveInput = Schema<'LeaveCreateRequest'>

export interface LeaveFilters {
  status?: string
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
