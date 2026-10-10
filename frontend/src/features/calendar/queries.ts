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
