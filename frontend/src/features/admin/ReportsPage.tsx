import { BarChart3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { HBarChart } from '@/components/charts/HBarChart'
import { StatusBars } from '@/features/reports/StatusBars'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { SortableTable } from '@/components/data/SortableTable'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/features/auth/authContext'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { usePeople } from '@/features/people/usePeople'
import { useProjects } from '@/features/projects/queries'
import { useDailyCheck, useLeaveOn, useProjectStatusCounts, useProjectTaskStats } from '@/features/reports/queries'
import { useManagerOptions, useServiceSummary, useTaskSummary, useWorkload, type StatusCount } from '@/features/team/queries'
import { addDays, monthStart } from '@/lib/calendar'
import { formatDate, formatDuration } from '@/lib/dates'
import { LEAVE_STATUS, PROJECT_STATUS, SERVICE_STATUS, TASK_STATUS } from '@/lib/labels'
import { useUrlParams } from '@/lib/useUrlParams'
import { useAttendanceReport, useLeaveSummary } from './queries'

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
] as const

/**
 * Management reports from the API's own aggregates, for the Owner (company-wide) and Managers
 * (their scope): attendance, a daily who-is-missing check, tasks, leave, projects, service and
 * workload. Everything is a count or a list the API returned; nothing here decides who may see what.
 */
export function ReportsPage() {
  const { user } = useAuth()
  const today = useCompanyToday()
  const [params, setParams] = useUrlParams({ range: '30', from: '', to: '', manager: '', project: '', day: '' })
  const custom = params.range === 'custom'
  const presetFrom = params.range === 'today' ? today : params.range === '7' ? addDays(today, -6) : params.range === 'month' ? monthStart(today.slice(0, 7)) : addDays(today, -29)
  const from = custom && params.from ? params.from : presetFrom
  const to = custom && params.to && params.to >= from ? params.to : today
  const day = params.day || today
  const isOwner = user?.role === 'owner'

  const managers = useManagerOptions()
  const projects = useProjects({ page: 1, page_size: 100 })
  const recentProjects = useProjects({ page: 1, page_size: 25 })
  const attendance = useAttendanceReport({ start_date: from, end_date: to, ...(params.manager ? { manager_id: params.manager } : {}) })
  const tasks = useTaskSummary(params.project || undefined)
  const leave = useLeaveSummary()
  const workload = useWorkload()
  const service = useServiceSummary(params.manager || undefined)
  const projectCounts = useProjectStatusCounts()
  const projectStats = useProjectTaskStats(recentProjects.data?.items ?? [])
  const check = useDailyCheck(day)
  const onLeave = useLeaveOn(day)
  const { nameOf } = usePeople([...(attendance.data ?? []).map((r) => r.user_id), ...(workload.data ?? []).map((r) => r.user_id), ...(onLeave.data ?? []).map((l) => l.employee_id)])

  const punched = new Set((check.attendance.data?.items ?? []).map((row) => row.user_id))
  const reported = new Set((check.eod.data?.items ?? []).map((row) => row.user_id))
  const expected = (check.people.data?.items ?? []).filter((person) => person.role !== 'owner')
  const noPunch = expected.filter((person) => !punched.has(person.id))
  const noEod = expected.filter((person) => !reported.has(person.id))
  const truncated =
    (check.people.data?.total ?? 0) > 100 || (check.attendance.data?.total ?? 0) > 100 || (check.eod.data?.total ?? 0) > 100
  const onLeaveIds = new Set((onLeave.data ?? []).map((l) => l.employee_id))
  const filtered = Boolean(params.manager || params.project || params.day || params.range !== '30')
  const attendanceRows = attendance.data ?? []
  const workloadRows = workload.data ?? []

  return (
    <section>
      <PageHeader
        title="Reports"
        description={isOwner ? 'Company-wide figures straight from the records. Narrow them with the filters below.' : 'Figures for your team and the work you can see. Narrow them with the filters below.'}
      />
      <div className="toolbar">
        <div className="field">
          <span className="field-label" id="period-label">
            Period (attendance)
          </span>
          <span className="segmented" role="group" aria-labelledby="period-label" style={{ marginBottom: 0 }}>
            {PRESETS.map((preset) => (
              <button key={preset.id} type="button" className={`segmented-item${params.range === preset.id ? ' active' : ''}`} aria-pressed={params.range === preset.id} onClick={() => setParams({ range: preset.id === '30' ? '' : preset.id, from: '', to: '' })}>
                {preset.label}
              </button>
            ))}
            <button type="button" className={`segmented-item${custom ? ' active' : ''}`} aria-pressed={custom} onClick={() => setParams({ range: 'custom', from, to })}>
              Custom
            </button>
          </span>
        </div>
        {custom && (
          <>
            <Input label="From" type="date" value={from} max={today} onChange={(event) => setParams({ range: 'custom', from: event.target.value })} />
            <Input label="To" type="date" value={to} min={from} max={today} onChange={(event) => setParams({ range: 'custom', to: event.target.value })} />
          </>
        )}
        <Select
          label="Manager"
          value={params.manager}
          onChange={(event) => setParams({ manager: event.target.value })}
          options={managers.options}
          placeholder={isOwner ? 'Whole company' : 'Everyone I can see'}
        />
        <Select
          label="Project (tasks)"
          value={params.project}
          onChange={(event) => setParams({ project: event.target.value })}
          options={(projects.data?.items ?? []).map((project) => ({ value: project.id, label: project.name }))}
          placeholder="All projects"
        />
        {filtered && (
          <Button variant="ghost" onClick={() => setParams({ range: '', from: '', to: '', manager: '', project: '', day: '' })}>
            Reset
          </Button>
        )}
      </div>
      <p style={{ marginBottom: 12, fontSize: 13 }}>
        The period applies to attendance. “Manager” limits attendance to that manager&apos;s direct reports and service activity to calls that manager is
        responsible for. There is no sort option on the API&apos;s lists, so only these report tables (which show everything) can be sorted.
      </p>

      <Section title={`Daily check · ${formatDate(day)}`} action={<Input label="Day" type="date" value={day} max={today} onChange={(event) => setParams({ day: event.target.value })} />}>
        <QueryBoundary query={check.people} skeleton={<Skeleton height={60} />}>
          {() => (
            <div className="form-grid two">
              <div>
                <h3 style={{ fontSize: 15, marginBottom: 6 }}>Not punched in ({noPunch.length})</h3>
                {check.attendance.isPending ? (
                  <Skeleton height={40} />
                ) : noPunch.length === 0 ? (
                  <p>Everyone punched in.</p>
                ) : (
                  <ul style={{ listStyle: 'none' }} className="stack">
                    {noPunch.map((person) => (
                      <li key={person.id}>
                        <Link className="inline-link" to={`/users/${person.id}`}>{person.name}</Link>
                        {onLeaveIds.has(person.id) ? <> <span className="badge badge-neutral">On leave</span></> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 style={{ fontSize: 15, marginBottom: 6 }}>No end-of-day report ({noEod.length})</h3>
                {check.eod.isPending ? (
                  <Skeleton height={40} />
                ) : noEod.length === 0 ? (
                  <p>Everyone submitted a report.</p>
                ) : (
                  <ul style={{ listStyle: 'none' }} className="stack">
                    {noEod.map((person) => (
                      <li key={person.id}>
                        <Link className="inline-link" to={`/users/${person.id}`}>{person.name}</Link>
                        {onLeaveIds.has(person.id) ? <> <span className="badge badge-neutral">On leave</span></> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </QueryBoundary>
        <p style={{ marginTop: 10, fontSize: 13 }}>
          Based on {expected.length} active {expected.length === 1 ? 'person' : 'people'} you can see.{' '}
          {onLeave.data && onLeave.data.length > 0 ? `${onLeave.data.length} on approved leave that day. ` : ''}
          {truncated ? 'Some lists have more than 100 entries, so this check may be incomplete.' : ''}
        </p>
      </Section>

      <Section title={`Attendance · ${formatDate(from)} – ${formatDate(to)}`}>
        <QueryBoundary
          query={attendance}
          skeleton={<Skeleton height={60} />}
          isEmpty={(rows) => rows.length === 0}
          empty={<EmptyState icon={<BarChart3 size={24} />} title="No attendance in this period" description="Nobody punched in between these dates." />}
        >
          {() => (
            <>
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Days present{attendanceRows.length > 10 ? ' (top 10)' : ''}</h3>
              <HBarChart
                title="Days present per person"
                unit="days"
                rows={[...attendanceRows].sort((a, b) => b.days_present - a.days_present).slice(0, 10).map((row) => ({ key: row.user_id, label: nameOf(row.user_id, '…'), value: row.days_present, href: `/users/${row.user_id}` }))}
              />
              <div style={{ height: 16 }} />
              <SortableTable
                rows={attendanceRows}
                rowKey={(row) => row.user_id}
                caption="Attendance per person"
                initial={{ key: 'days', direction: 'desc' }}
                columns={[
                  { key: 'person', header: 'Person', sortValue: (r) => nameOf(r.user_id), cell: (r) => <Link className="inline-link" to={`/users/${r.user_id}`}>{nameOf(r.user_id, '…')}</Link> },
                  { key: 'days', header: 'Days present', numeric: true, sortValue: (r) => r.days_present, cell: (r) => r.days_present },
                  { key: 'time', header: 'Time worked', numeric: true, sortValue: (r) => r.total_minutes, cell: (r) => formatDuration(r.total_minutes) || '0m' },
                  { key: 'avg', header: 'Average per day', numeric: true, sortValue: (r) => (r.days_present ? r.total_minutes / r.days_present : 0), cell: (r) => (r.days_present > 0 ? formatDuration(Math.round(r.total_minutes / r.days_present)) : '—') },
                ]}
              />
            </>
          )}
        </QueryBoundary>
      </Section>

      <div className="form-grid two">
        <Section title="Tasks by status">
          <QueryBoundary query={tasks} skeleton={<Skeleton height={60} />}>
            {(data) => (
              <>
                <p style={{ marginBottom: 8 }}>{data.total} {data.total === 1 ? 'task' : 'tasks'}{params.project ? ' in this project' : ''}</p>
                <StatusBars title="Tasks by status" rows={data.by_status} table={TASK_STATUS} unit="tasks" emphasise="blocked" empty="No tasks yet." />
              </>
            )}
          </QueryBoundary>
        </Section>
        <Section title="Leave requests by status">
          <QueryBoundary query={leave} skeleton={<Skeleton height={60} />}>
            {(data) => (
              <>
                <p style={{ marginBottom: 8 }}>{data.total} {data.total === 1 ? 'request' : 'requests'}</p>
                <StatusBars title="Leave requests by status" rows={data.by_status} table={LEAVE_STATUS} unit="requests" emphasise="pending" empty="No leave requests yet." />
              </>
            )}
          </QueryBoundary>
        </Section>
      </div>

      <Section title="Projects">
        {projectCounts.isPending ? (
          <Skeleton height={60} />
        ) : projectCounts.rows.every((row) => row.count === 0) ? (
          <p>No projects yet.</p>
        ) : (
          <HBarChart title="Projects by status" unit="projects" total={projectCounts.rows.reduce((sum, row) => sum + row.count, 0)} rows={projectCounts.rows.map((row) => ({ key: row.status, label: PROJECT_STATUS[row.status as keyof typeof PROJECT_STATUS].label, value: row.count }))} />
        )}
        <div style={{ height: 16 }} />
        <QueryBoundary query={recentProjects} skeleton={<Skeleton height={60} />} isEmpty={(r) => r.items.length === 0} empty={<span />}>
          {(data) => (
            <>
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Task progress by project{data.total > data.items.length ? ` (the ${data.items.length} newest of ${data.total})` : ''}</h3>
              <SortableTable
                rows={projectStats}
                rowKey={(row) => row.project.id}
                caption="Task progress by project"
                columns={[
                  { key: 'project', header: 'Project', sortValue: (r) => r.project.name, cell: (r) => <Link className="inline-link" to={`/projects/${r.project.id}`}>{r.project.name}</Link> },
                  { key: 'status', header: 'Status', cell: (r) => (<><StatusBadge table={PROJECT_STATUS} value={r.project.status} />{!r.project.is_active && <> <span className="badge badge-neutral">Archived</span></>}</>) },
                  { key: 'tasks', header: 'Tasks', numeric: true, sortValue: (r) => r.report?.total ?? 0, cell: (r) => (r.isPending ? '…' : (r.report?.total ?? 0)) },
                  { key: 'done', header: 'Completed', numeric: true, sortValue: (r) => completed(r.report?.by_status), cell: (r) => (r.isPending ? '…' : completed(r.report?.by_status)) },
                  { key: 'blocked', header: 'Blocked', numeric: true, sortValue: (r) => blocked(r.report?.by_status), cell: (r) => (r.isPending ? '…' : blocked(r.report?.by_status)) },
                  { key: 'pct', header: 'Complete', numeric: true, sortValue: (r) => ((r.report?.total ?? 0) ? completed(r.report?.by_status) / (r.report?.total ?? 1) : -1), cell: (r) => (r.isPending ? '…' : (r.report?.total ?? 0) ? `${Math.round((completed(r.report?.by_status) / (r.report?.total ?? 1)) * 100)}%` : '—') },
                ]}
              />
            </>
          )}
        </QueryBoundary>
      </Section>

      <Section title="Service activity">
        <QueryBoundary query={service} skeleton={<Skeleton height={60} />}>
          {(data) => (
            <>
              <p style={{ marginBottom: 8 }}>
                {data.total_calls} {data.total_calls === 1 ? 'call' : 'calls'}
                {data.average_resolution_minutes !== null ? ` · average time to resolve about ${formatDuration(Math.round(data.average_resolution_minutes)) || '0m'} (an approximation from the record's last update)` : ''}
              </p>
              <StatusBars title="Service calls by status" rows={data.by_status} table={SERVICE_STATUS} unit="calls" emphasise="reopened" empty="No service calls yet." />
            </>
          )}
        </QueryBoundary>
      </Section>

      <Section title="Workload">
        <QueryBoundary query={workload} skeleton={<Skeleton height={60} />} isEmpty={(rows) => rows.length === 0} empty={<p>No one has open work.</p>}>
          {() => (
            <>
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Open tasks{workloadRows.length > 10 ? ' (top 10)' : ''}</h3>
              <HBarChart
                title="Open tasks per person"
                unit="open tasks"
                rows={[...workloadRows].sort((a, b) => b.open_task_count - a.open_task_count).slice(0, 10).map((row) => ({ key: row.user_id, label: nameOf(row.user_id, '…'), value: row.open_task_count, href: `/users/${row.user_id}` }))}
              />
              <div style={{ height: 16 }} />
              <SortableTable
                rows={workloadRows}
                rowKey={(row) => row.user_id}
                caption="Open work per person"
                initial={{ key: 'tasks', direction: 'desc' }}
                columns={[
                  { key: 'person', header: 'Person', sortValue: (r) => nameOf(r.user_id), cell: (r) => <Link className="inline-link" to={`/users/${r.user_id}`}>{nameOf(r.user_id, '…')}</Link> },
                  { key: 'tasks', header: 'Open tasks', numeric: true, sortValue: (r) => r.open_task_count, cell: (r) => r.open_task_count },
                  { key: 'calls', header: 'Active service calls', numeric: true, sortValue: (r) => r.active_service_assignment_count, cell: (r) => r.active_service_assignment_count },
                ]}
              />
            </>
          )}
        </QueryBoundary>
      </Section>
    </section>
  )
}

const completed = (rows: readonly StatusCount[] | undefined) => rows?.find((r) => r.status === 'completed')?.count ?? 0
const blocked = (rows: readonly StatusCount[] | undefined) => rows?.find((r) => r.status === 'blocked')?.count ?? 0
