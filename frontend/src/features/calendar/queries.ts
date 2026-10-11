import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'

export type CalendarEntry = Schema<'CalendarEntry'>

export interface CalendarFilters {
  start_date: string
  end_date: string
  user_id?: string
  project_id?: string
  /** Direct reports of this manager only. */
  team?: string
}

export function useCalendar(filters: CalendarFilters) {
  return useQuery({
    queryKey: ['calendar', filters],
    queryFn: ({ signal }) => api.get<Schema<'CalendarResponse'>>('/calendar', { query: { ...filters }, signal }),
    select: (response) => response.items,
    staleTime: 30_000,
  })
}

export function groupByDate(entries: readonly CalendarEntry[]): Map<string, CalendarEntry[]> {
  const grouped = new Map<string, CalendarEntry[]>()
  for (const entry of entries) {
    const list = grouped.get(entry.entry_date)
    if (list) list.push(entry)
    else grouped.set(entry.entry_date, [entry])
  }
  return grouped
}

export type CalendarLeave = Schema<'LeaveResponse'>

/**
 * The calendar API reports a leave once, on its first day. To show it on every day it covers we read
 * the leave requests themselves (the 100 most recent pending and approved the caller can see) and
 * match them to calendar entries by person and first day; an entry with no match stays a single day.
 */
export function useCalendarLeaves(enabled: boolean) {
  return useQuery({
    queryKey: ['calendar', 'leaves'],
    queryFn: async ({ signal }) => {
      const read = (status: 'approved' | 'pending') =>
        api.get<Schema<'LeaveListResponse'>>('/leaves', { query: { status, page: 1, page_size: 100 }, signal })
      const [approved, pending] = await Promise.all([read('approved'), read('pending')])
      return [...approved.items, ...pending.items]
    },
    enabled,
    staleTime: 30_000,
  })
}

/** Every day from `a` to `b` (inclusive, YYYY-MM-DD). */
function eachDay(a: string, b: string): string[] {
  const days: string[] = []
  for (let day = a; day <= b; day = shift(day, 1)) days.push(day)
  return days
}
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Spread each leave entry over the days of its request that fall inside [from, to]. */
export function spreadLeave(entries: readonly CalendarEntry[], leaves: readonly CalendarLeave[], from: string, to: string): CalendarEntry[] {
  const out: CalendarEntry[] = []
  for (const entry of entries) {
    if (entry.entry_type !== 'leave') {
      out.push(entry)
      continue
    }
    const leave = leaves.find((l) => l.employee_id === entry.user_id && l.start_date === entry.entry_date && l.status === entry.status)
    if (!leave) {
      out.push(entry)
      continue
    }
    const first = leave.start_date > from ? leave.start_date : from
    const last = leave.end_date < to ? leave.end_date : to
    for (const day of eachDay(first, last)) out.push({ ...entry, entry_date: day })
  }
  return out
}
