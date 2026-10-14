import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'
import type { Coordinates } from '@/lib/geolocation'
import type { WorkMode } from '@/lib/labels'

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

export interface TeamAttendanceFilters extends AttendanceFilters {
  user_id?: string
}

/** Attendance days of everyone the caller may see (own + reporting subtree + grants). */
export function useTeamAttendance(filters: TeamAttendanceFilters) {
  return useQuery({
    queryKey: ['attendance', 'team', filters],
    queryFn: ({ signal }) =>
      api.get<Schema<'AttendanceListResponse'>>('/attendance', { query: { ...filters }, signal }),
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

export interface PunchInput {
  coordinates: Coordinates | null
  /** Punch-in only: where the person is working today, and an optional remark for the reports. */
  workMode?: WorkMode
  remark?: string
}

export function usePunch(kind: 'in' | 'out') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ coordinates, workMode, remark }: PunchInput) =>
      api.post<AttendanceDay>(`/attendance/punch-${kind}`, {
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
        ...(kind === 'in' ? { work_mode: workMode ?? 'at_office', remark: remark?.trim() || null } : {}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendance'] }),
  })
}
