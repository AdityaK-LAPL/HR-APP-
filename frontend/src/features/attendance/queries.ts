import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'
import type { Coordinates } from '@/lib/geolocation'

export type AttendanceDay = Schema<'AttendanceDayResponse'>
export type AttendanceEvent = Schema<'AttendanceEventResponse'>

export interface AttendanceFilters {
  start_date?: string
  end_date?: string
  page: number
  page_size: number
}

export function useTodayAttendance(userId: string | undefined, today: string) {
  return useQuery({
    queryKey: ['attendance', 'today', userId, today],
    queryFn: ({ signal }) =>
      api
        .get<Schema<'AttendanceListResponse'>>('/attendance', {
          query: { user_id: userId, start_date: today, end_date: today, page: 1, page_size: 1 },
          signal,
        })
        .then((response) => response.items[0] ?? null),
    enabled: Boolean(userId),
  })
}

export function useAttendanceHistory(userId: string | undefined, filters: AttendanceFilters) {
  return useQuery({
    queryKey: ['attendance', 'history', userId, filters],
    queryFn: ({ signal }) =>
      api.get<Schema<'AttendanceListResponse'>>('/attendance', {
        query: { user_id: userId, ...filters },
        signal,
      }),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
  })
}

export function useAttendanceEvents(userId: string, workDate: string | null) {
  return useQuery({
    queryKey: ['attendance', 'events', userId, workDate],
    queryFn: ({ signal }) =>
      api.get<AttendanceEvent[]>(`/attendance/${userId}/${workDate}/events`, { signal }),
    enabled: workDate !== null,
  })
}

export function usePunch(kind: 'in' | 'out') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (coordinates: Coordinates | null) =>
      api.post<AttendanceDay>(`/attendance/punch-${kind}`, {
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendance'] }),
  })
}
