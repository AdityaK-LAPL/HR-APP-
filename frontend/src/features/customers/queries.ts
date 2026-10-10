import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'
import { callKeys, type Customer, type CustomerContact, type Machine, type ServiceCall } from '@/features/service/queries'

export type CustomerInput = Schema<'CustomerCreateRequest'>
export type CustomerPatch = Schema<'CustomerUpdateRequest'>
export type ContactInput = Schema<'CustomerContactCreateRequest'>
export type ContactPatch = Schema<'CustomerContactUpdateRequest'>
export type MachineInput = Schema<'MachineCreateRequest'>
export type MachinePatch = Schema<'MachineUpdateRequest'>
export type CallInput = Schema<'ServiceCallCreateRequest'>
export type CallPatch = Schema<'ServiceCallUpdateRequest'>

/** Customer matches for a type-ahead picker (the directory can be large, so it is searched, not listed). */
export function useCustomerSearch(text: string, enabled = true) {
  return useQuery({
    queryKey: ['customers', 'search', text],
    queryFn: ({ signal }) =>
      api.get<Schema<'CustomerListResponse'>>('/customers', {
        query: { ...(text ? { name: text } : {}), page: 1, page_size: 20 },
        signal,
      }),
    enabled,
    staleTime: 30_000,
  })
}

/** All of one customer's machines (a customer rarely has more than a handful). */
export function useCustomerMachines(customerId: string | undefined) {
  return useQuery({
    queryKey: ['machines', 'of-customer', customerId],
    queryFn: ({ signal }) =>
      api.get<Schema<'MachineListResponse'>>('/machines', { query: { customer_id: customerId, page: 1, page_size: 100 }, signal }),
    enabled: Boolean(customerId),
    select: (response) => response.items,
  })
}

const invalidateCustomers = (queryClient: ReturnType<typeof useQueryClient>) => {
  void queryClient.invalidateQueries({ queryKey: ['customers'] })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CustomerInput) => api.post<Customer>('/customers', input),
    onSuccess: () => invalidateCustomers(queryClient),
  })
}

/** Omitted fields are unchanged (a value cannot be cleared). `is_active: false` deactivates (Owner only). */
export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CustomerPatch }) => api.patch<Customer>(`/customers/${id}`, patch),
    onSuccess: (customer) => {
      queryClient.setQueryData(['customers', 'detail', customer.id], customer)
      invalidateCustomers(queryClient)
    },
  })
}

export function useAddContact(customerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ContactInput) => api.post<CustomerContact>(`/customers/${customerId}/contacts`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers', 'contacts', customerId] }),
  })
}

export function useUpdateContact(customerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ContactPatch }) =>
      api.patch<CustomerContact>(`/customers/${customerId}/contacts/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers', 'contacts', customerId] }),
  })
}

export function useCreateMachine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MachineInput) => api.post<Machine>('/machines', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['machines'] }),
  })
}

export function useUpdateMachine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MachinePatch }) => api.patch<Machine>(`/machines/${id}`, patch),
    onSuccess: (machine) => {
      queryClient.setQueryData(['machines', 'detail', machine.id], machine)
      void queryClient.invalidateQueries({ queryKey: ['machines'] })
    },
  })
}

export function useCreateServiceCall() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CallInput) => api.post<ServiceCall>('/service-calls', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: callKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

/** Omitted fields are unchanged; `responsible_manager_id` is Owner-only on the server. */
export function useUpdateServiceCall() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CallPatch }) => api.patch<ServiceCall>(`/service-calls/${id}`, patch),
    onSuccess: (call) => {
      queryClient.setQueryData(callKeys.detail(call.id), call)
      void queryClient.invalidateQueries({ queryKey: ['service-calls', 'list'] })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
