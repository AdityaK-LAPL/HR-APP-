import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'

export type ServiceCall = Schema<'ServiceCallResponse'>
export type ServiceStatus = ServiceCall['status']
export type Assignment = Schema<'ServiceAssignmentResponse'>
export type Visit = Schema<'ServiceVisitResponse'>
export type VisitInput = Schema<'ServiceVisitCreateRequest'>
export type VisitUpdate = Schema<'ServiceVisitUpdateRequest'>
export type ServiceReport = Schema<'ServiceReportResponse'>
export type ReportInput = Schema<'ServiceReportCreateRequest'>
export type Customer = Schema<'CustomerResponse'>
export type CustomerContact = Schema<'CustomerContactResponse'>
export type Machine = Schema<'MachineResponse'>

export interface CallFilters {
  status?: string
  service_call_code?: string
  page: number
  page_size: number
}

export const callKeys = {
  all: ['service-calls'] as const,
  list: (f: CallFilters) => ['service-calls', 'list', f] as const,
  detail: (id: string) => ['service-calls', 'detail', id] as const,
  assignments: (id: string) => ['service-calls', 'assignments', id] as const,
  visits: (id: string) => ['service-calls', 'visits', id] as const,
  reports: (id: string) => ['service-calls', 'reports', id] as const,
}

export function useServiceCalls(filters: CallFilters) {
  return useQuery({
    queryKey: callKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get<Schema<'ServiceCallListResponse'>>('/service-calls', { query: { ...filters }, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useServiceCall(id: string) {
  return useQuery({
    queryKey: callKeys.detail(id),
    queryFn: ({ signal }) => api.get<ServiceCall>(`/service-calls/${id}`, { signal }),
  })
}

export function useAssignments(id: string) {
  return useQuery({
    queryKey: callKeys.assignments(id),
    queryFn: ({ signal }) => api.get<Assignment[]>(`/service-calls/${id}/assignments`, { signal }),
  })
}

export function useVisits(id: string) {
  return useQuery({
    queryKey: callKeys.visits(id),
    queryFn: ({ signal }) => api.get<Visit[]>(`/service-calls/${id}/visits`, { signal }),
  })
}

export function useServiceReports(id: string) {
  return useQuery({
    queryKey: callKeys.reports(id),
    queryFn: ({ signal }) => api.get<ServiceReport[]>(`/service-calls/${id}/reports`, { signal }),
  })
}

/** Customer / machine are readable only while the caller is assigned; an unreadable one is not an error to retry. */
export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: ({ signal }) => api.get<Customer>(`/customers/${id}`, { signal }),
    enabled: Boolean(id),
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useCustomerContacts(id: string | undefined) {
  return useQuery({
    queryKey: ['customers', 'contacts', id],
    queryFn: ({ signal }) => api.get<CustomerContact[]>(`/customers/${id}/contacts`, { signal }),
    enabled: Boolean(id),
    retry: false,
  })
}

export function useMachine(id: string | undefined) {
  return useQuery({
    queryKey: ['machines', 'detail', id],
    queryFn: ({ signal }) => api.get<Machine>(`/machines/${id}`, { signal }),
    enabled: Boolean(id),
    retry: false,
    staleTime: 5 * 60_000,
  })
}

/** Names for the customers on a page of calls, one cached request per distinct customer. */
export function useCustomerNames(ids: readonly string[]) {
  const unique = [...new Set(ids)]
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: ['customers', 'detail', id],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.get<Customer>(`/customers/${id}`, { signal }),
      retry: false,
      staleTime: 5 * 60_000,
    })),
  })
  const names = new Map<string, string>()
  unique.forEach((id, index) => {
    const name = results[index]?.data?.name
    if (name) names.set(id, name)
  })
  return (id: string) => names.get(id) ?? '…'
}

export function useUpdateCallStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ServiceStatus }) =>
      api.patch<ServiceCall>(`/service-calls/${id}`, { status }),
    onSuccess: (call) => {
      queryClient.setQueryData(callKeys.detail(call.id), call)
      void queryClient.invalidateQueries({ queryKey: ['service-calls', 'list'] })
    },
  })
}

export function useCreateVisit(callId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: VisitInput) => api.post<Visit>(`/service-calls/${callId}/visits`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: callKeys.visits(callId) }),
  })
}

export function useUpdateVisit(callId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: VisitUpdate }) => api.patch<Visit>(`/service-visits/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: callKeys.visits(callId) }),
  })
}

export function useSubmitReport(callId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ReportInput) => api.post<ServiceReport>(`/service-calls/${callId}/report`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: callKeys.reports(callId) }),
  })
}
