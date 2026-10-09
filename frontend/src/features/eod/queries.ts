import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'

export type EodReport = Schema<'EodResponse'>
export type EodInput = Schema<'EodCreateRequest'>

export interface EodFilters {
  report_date?: string
  page: number
  page_size: number
}

export function useEodList(filters: EodFilters) {
  return useQuery({
    queryKey: ['eod', 'list', filters],
    queryFn: ({ signal }) => api.get<Schema<'EodListResponse'>>('/eod', { query: { ...filters }, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useEod(id: string) {
  return useQuery({
    queryKey: ['eod', 'detail', id],
    queryFn: ({ signal }) => api.get<EodReport>(`/eod/${id}`, { signal }),
  })
}

export function useSubmitEod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: EodInput) => api.post<EodReport>('/eod', input),
    onSuccess: (report) => {
      queryClient.setQueryData(['eod', 'detail', report.id], report)
      void queryClient.invalidateQueries({ queryKey: ['eod', 'list'] })
    },
  })
}
