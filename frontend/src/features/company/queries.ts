import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'
import { useAuth } from '@/features/auth/authContext'
import { useCan } from '@/features/permissions/usePermissions'

export type CompanySettings = Schema<'CompanySettingsResponse'>
export type CompanySettingsInput = Schema<'CompanySettingsUpdateRequest'>
export type Holiday = Schema<'HolidayResponse'>
export type HolidayInput = Schema<'HolidayCreateRequest'>
export type AttendanceAnalytics = Schema<'AttendanceAnalyticsResponse'>
export type LeaveAnalytics = Schema<'LeaveAnalyticsResponse'>

/** The Owner, or a manager the Owner allowed to download the company's attendance reports. */
export function useCanOpenCompanyReports(): boolean {
  const { user } = useAuth()
  const can = useCan()
  return user?.role === 'owner' || (user?.role === 'manager' && can('download_company_reports'))
}

export function useCompanySettings() {
  return useQuery({
    queryKey: ['company', 'settings'],
    queryFn: ({ signal }) => api.get<CompanySettings>('/company/settings', { signal }),
    staleTime: 5 * 60_000,
  })
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CompanySettingsInput) => api.patch<CompanySettings>('/company/settings', input),
    onSuccess: (data) => {
      queryClient.setQueryData(['company', 'settings'], data)
      void queryClient.invalidateQueries({ queryKey: ['reports', 'attendance-analytics'] })
    },
  })
}

export function useHolidays(year: number) {
  return useQuery({
    queryKey: ['company', 'holidays', year],
    queryFn: ({ signal }) => api.get<Holiday[]>('/company/holidays', { query: { year }, signal }),
    staleTime: 5 * 60_000,
  })
}

export function useAddHoliday() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: HolidayInput) => api.post<Holiday>('/company/holidays', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company', 'holidays'] })
      void queryClient.invalidateQueries({ queryKey: ['reports', 'attendance-analytics'] })
    },
  })
}

export function useRemoveHoliday() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/company/holidays/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company', 'holidays'] })
      void queryClient.invalidateQueries({ queryKey: ['reports', 'attendance-analytics'] })
    },
  })
}

export function useAttendanceAnalytics(month: string, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'attendance-analytics', month],
    queryFn: ({ signal }) => api.get<AttendanceAnalytics>('/reports/attendance-analytics', { query: { month }, signal }),
    enabled,
    staleTime: 60_000,
  })
}

export function useLeaveAnalytics(financialYear: number, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'leave-analytics', financialYear],
    queryFn: ({ signal }) =>
      api.get<LeaveAnalytics>('/reports/leave-analytics', { query: { financial_year: financialYear }, signal }),
    enabled,
    staleTime: 60_000,
  })
}
