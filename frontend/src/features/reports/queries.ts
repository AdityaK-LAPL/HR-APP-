import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'
import type { Project } from '@/features/projects/queries'
import { PROJECT_STATUS } from '@/lib/labels'

const PROJECT_STATUSES = Object.keys(PROJECT_STATUS)

/** How many projects there are in each status (one cheap count request per status). */
export function useProjectStatusCounts() {
  const results = useQueries({
    queries: PROJECT_STATUSES.map((status) => ({
      queryKey: ['reports', 'projects', 'count', status],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.get<Schema<'ProjectListResponse'>>('/projects', { query: { status, page: 1, page_size: 1 }, signal }).then((r) => r.total),
      staleTime: 60_000,
    })),
  })
  return {
    isPending: results.some((r) => r.isPending),
    isError: results.some((r) => r.isError),
    rows: PROJECT_STATUSES.map((status, index) => ({ status, count: results[index]?.data ?? 0 })),
  }
}

/** Task counts per project, from the same report endpoint the company task report uses. */
export function useProjectTaskStats(projects: readonly Project[]) {
  const results = useQueries({
    queries: projects.map((project) => ({
      queryKey: ['reports', 'tasks', project.id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.get<Schema<'TaskReportResponse'>>('/reports/tasks', { query: { project_id: project.id }, signal }),
      staleTime: 60_000,
    })),
  })
  return projects.map((project, index) => ({ project, report: results[index]?.data, isPending: results[index]?.isPending ?? true }))
}

/**
 * Who has (and has not) punched in / submitted an end-of-day report on a day: the active people the
 * caller can see, set against the attendance and EOD rows the API returns for that day. Each list
 * is read up to 100 rows; `truncated` says when a list may be incomplete.
 */
export function useDailyCheck(date: string) {
  const people = useQuery({
    queryKey: ['reports', 'daily', 'people'],
    queryFn: ({ signal }) => api.get<Schema<'UserListResponse'>>('/users', { query: { is_active: true, page: 1, page_size: 100 }, signal }),
    staleTime: 60_000,
  })
  const attendance = useQuery({
    queryKey: ['reports', 'daily', 'attendance', date],
    queryFn: ({ signal }) => api.get<Schema<'AttendanceListResponse'>>('/attendance', { query: { start_date: date, end_date: date, page: 1, page_size: 100 }, signal }),
    placeholderData: keepPreviousData,
  })
  const eod = useQuery({
    queryKey: ['reports', 'daily', 'eod', date],
    queryFn: ({ signal }) => api.get<Schema<'EodListResponse'>>('/eod', { query: { report_date: date, page: 1, page_size: 100 }, signal }),
    placeholderData: keepPreviousData,
  })
  return { people, attendance, eod }
}

/** Approved leave that covers `date` (the 100 most recent approved requests the caller can see). */
export function useLeaveOn(date: string) {
  return useQuery({
    queryKey: ['reports', 'leave-on', date],
    queryFn: ({ signal }) => api.get<Schema<'LeaveListResponse'>>('/leaves', { query: { status: 'approved', page: 1, page_size: 100 }, signal }),
    select: (response) => response.items.filter((leave) => leave.start_date <= date && leave.end_date >= date),
    staleTime: 60_000,
  })
}
