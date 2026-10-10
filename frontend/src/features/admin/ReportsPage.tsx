import { BarChart3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { usePeople } from '@/features/people/usePeople'
import { useProjects } from '@/features/projects/queries'
import {
  personLabel,
  useServiceSummary,
  useTaskSummary,
  useVisibleUsers,
  useWorkload,
  type StatusCount,
} from '@/features/team/queries'
import { addDays } from '@/lib/calendar'
import { formatDate, formatDuration } from '@/lib/dates'
import { LEAVE_STATUS, SERVICE_STATUS, TASK_STATUS } from '@/lib/labels'
import { useUrlParams } from '@/lib/useUrlParams'
import { useAttendanceReport, useLeaveSummary } from './queries'

type Table = Parameters<typeof StatusBadge>[0]['table']

/** Counts by status, in the order the label table lists them; statuses with no rows are shown as zero. */
function StatusCounts({ rows, table, empty }: { rows: readonly StatusCount[]; table: Table; empty: string }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  if (total === 0) return <p>{empty}</p>
  const byStatus = new Map(rows.map((row) => [row.status, row.count]))
  return (
    <table className="table">
      <caption className="visually-hidden">Counts by status</caption>
      <thead>
        <tr>
          <th scope="col">Status</th>
          <th scope="col">Count</th>
          <th scope="col">Share</th>
        </tr>
      </thead>
      <tbody>
        {Object.keys(table).map((status) => {
          const count = byStatus.get(status) ?? 0
          return (
            <tr key={status}>
              <td>
                <StatusBadge table={table} value={status} />
              </td>
              <td>{count}</td>
              <td>{Math.round((count / total) * 100)}%</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/**
 * Company reports: the API's own aggregates (attendance, tasks, leave, workload, service activity),
 * shown as plain tables. Charts, exports and per-project/EOD reporting belong to Prompt 11.
 */
export function ReportsPage() {
  const today = useCompanyToday()
  const [params, setParams] = useUrlParams({ from: '', to: '', manager: '', project: '' })
  const from = params.from || addDays(today, -29)
  const to = params.to && params.to >= from ? params.to : today
  const managers = useVisibleUsers({ role: 'manager', is_active: true, page: 1, page_size: 100 })
  const projects = useProjects({ page: 1, page_size: 100 })

  const attendance = useAttendanceReport({ start_date: from, end_date: to, ...(params.manager ? { manager_id: params.manager } : {}) })
  const tasks = useTaskSummary(params.project || undefined)
  const leave = useLeaveSummary()
  const workload = useWorkload()
  const service = useServiceSummary(params.manager || undefined)
  const { nameOf } = usePeople([...(attendance.data ?? []).map((row) => row.user_id), ...(workload.data ?? []).map((row) => row.user_id)])
  const filtered = Boolean(params.from || params.to || params.manager || params.project)

  const attendanceRows = [...(attendance.data ?? [])].sort((a, b) => b.days_present - a.days_present || nameOf(a.user_id).localeCompare(nameOf(b.user_id)))
  const workloadRows = [...(workload.data ?? [])].sort((a, b) => b.open_task_count - a.open_task_count || b.active_service_assignment_count - a.active_service_assignment_count)

  return (
    <section>
      <PageHeader title="Reports" description="Company-wide figures straight from the records. Narrow them with the filters below." />
      <div className="toolbar">
        <Input label="From" type="date" value={from} onChange={(event) => setParams({ from: event.target.value })} />
        <Input label="To" type="date" value={to} min={from} onChange={(event) => setParams({ to: event.target.value })} />
        <Select
          label="Manager"
          value={params.manager}
          onChange={(event) => setParams({ manager: event.target.value })}
          options={(managers.data?.items ?? []).map((person) => ({ value: person.id, label: personLabel(person) }))}
          placeholder="Whole company"
        />
        <Select
          label="Project (tasks)"
          value={params.project}
          onChange={(event) => setParams({ project: event.target.value })}
          options={(projects.data?.items ?? []).map((project) => ({ value: project.id, label: project.name }))}
          placeholder="All projects"
        />
        {filtered && (
          <Button variant="ghost" onClick={() => setParams({ from: '', to: '', manager: '', project: '' })}>
            Reset
          </Button>
        )}
      </div>
      <p style={{ marginBottom: 12, fontSize: 13 }}>
        The date range applies to attendance. “Manager” limits attendance to that manager&apos;s direct reports and service activity to calls that manager is
        responsible for.
      </p>

      <Section title={`Attendance · ${formatDate(from)} – ${formatDate(to)}`}>
        <QueryBoundary
          query={attendance}
          skeleton={<Skeleton height={60} />}
          isEmpty={(rows) => rows.length === 0}
          empty={<EmptyState icon={<BarChart3 size={24} />} title="No attendance in this period" description="Nobody punched in between these dates." />}
        >
          {() => (
            <div className="table-wrap">
              <table className="table">
                <caption className="visually-hidden">Attendance per person</caption>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Days present</th>
                    <th scope="col">Time worked</th>
                    <th scope="col">Average per day</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRows.map((row) => (
                    <tr key={row.user_id}>
                      <td>
                        <Link to={`/users/${row.user_id}`}>{nameOf(row.user_id, '…')}</Link>
                      </td>
                      <td>{row.days_present}</td>
                      <td>{formatDuration(row.total_minutes) || '0m'}</td>
                      <td>{row.days_present > 0 ? formatDuration(Math.round(row.total_minutes / row.days_present)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryBoundary>
      </Section>

      <div className="form-grid two">
        <Section title="Tasks by status">
          <QueryBoundary query={tasks} skeleton={<Skeleton height={60} />}>
            {(data) => (
              <>
                <p style={{ marginBottom: 8 }}>{data.total} {data.total === 1 ? 'task' : 'tasks'}{params.project ? ' in this project' : ''}</p>
                <StatusCounts rows={data.by_status} table={TASK_STATUS} empty="No tasks yet." />
              </>
            )}
          </QueryBoundary>
        </Section>
        <Section title="Leave requests by status">
          <QueryBoundary query={leave} skeleton={<Skeleton height={60} />}>
            {(data) => (
              <>
                <p style={{ marginBottom: 8 }}>{data.total} {data.total === 1 ? 'request' : 'requests'}</p>
                <StatusCounts rows={data.by_status} table={LEAVE_STATUS} empty="No leave requests yet." />
              </>
            )}
          </QueryBoundary>
        </Section>
      </div>

      <Section title="Service activity">
        <QueryBoundary query={service} skeleton={<Skeleton height={60} />}>
          {(data) => (
            <>
              <p style={{ marginBottom: 8 }}>
                {data.total_calls} {data.total_calls === 1 ? 'call' : 'calls'}
                {data.average_resolution_minutes !== null
                  ? ` · average time to resolve about ${formatDuration(Math.round(data.average_resolution_minutes)) || '0m'} (an approximation from the record's last update)`
                  : ''}
              </p>
              <StatusCounts rows={data.by_status} table={SERVICE_STATUS} empty="No service calls yet." />
            </>
          )}
        </QueryBoundary>
      </Section>

      <Section title="Workload">
        <QueryBoundary
          query={workload}
          skeleton={<Skeleton height={60} />}
          isEmpty={(rows) => rows.length === 0}
          empty={<p>No one has open work.</p>}
        >
          {() => (
            <div className="table-wrap">
              <table className="table">
                <caption className="visually-hidden">Open work per person</caption>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Open tasks</th>
                    <th scope="col">Active service calls</th>
                  </tr>
                </thead>
                <tbody>
                  {workloadRows.map((row) => (
                    <tr key={row.user_id}>
                      <td>
                        <Link to={`/users/${row.user_id}`}>{nameOf(row.user_id, '…')}</Link>
                      </td>
                      <td>{row.open_task_count}</td>
                      <td>{row.active_service_assignment_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryBoundary>
      </Section>
    </section>
  )
}
