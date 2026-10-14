import { Link } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { StatTile } from '@/components/data/StatTile'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { actionLabel } from '@/features/admin/auditLabels'
import { useAuditLogs, useGrants } from '@/features/admin/queries'
import { useTeamAttendance } from '@/features/attendance/queries'
import { useAuth } from '@/features/auth/authContext'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { useLeaves } from '@/features/leave/queries'
import { usePeople } from '@/features/people/usePeople'
import { StatusBars } from '@/features/reports/StatusBars'
import { useLeaveOn } from '@/features/reports/queries'
import { useTasks } from '@/features/tasks/queries'
import { countOf, useServiceSummary, useTaskSummary, useVisibleUsers, useWorkload } from '@/features/team/queries'
import { formatDate, formatDateTime, leaveDays } from '@/lib/dates'
import { TASK_STATUS } from '@/lib/labels'

const ACTIVE_CALL_STATUSES = [
  'new', 'assigned', 'in_progress', 'waiting_customer', 'waiting_parts',
  'remote_support', 'field_visit_scheduled', 'field_visit_completed', 'reopened',
]

/** "Company overview": every figure is the API's own count over the whole company. */
export function OwnerDashboard() {
  const { user } = useAuth()
  const today = useCompanyToday()
  const people = useVisibleUsers({ is_active: true, page: 1, page_size: 1 })
  const managers = useVisibleUsers({ role: 'manager', is_active: true, page: 1, page_size: 1 })
  const taskSummary = useTaskSummary()
  const onLeave = useLeaveOn(today)
  const serviceSummary = useServiceSummary()
  const pendingLeave = useLeaves({ status: 'pending', page: 1, page_size: 5 })
  const punched = useTeamAttendance({ start_date: today, end_date: today, page: 1, page_size: 1 })
  const blocked = useTasks({ status: 'blocked', page: 1, page_size: 5 })
  const workload = useWorkload()
  const grants = useGrants({})
  const audit = useAuditLogs({ page: 1, page_size: 5 })

  const busiest = [...(workload.data ?? [])]
    .filter((row) => row.open_task_count > 0)
    .sort((a, b) => b.open_task_count - a.open_task_count)
    .slice(0, 5)
  const { nameOf } = usePeople([
    ...(pendingLeave.data?.items ?? []).flatMap((leave) => [leave.employee_id, leave.current_approver_id]),
    ...(blocked.data?.items ?? []).map((task) => task.assigned_to),
    ...busiest.map((row) => row.user_id),
    ...(onLeave.data ?? []).map((leave) => leave.employee_id),
    ...(audit.data?.items ?? []).map((log) => log.actor_user_id),
  ])

  return (
    <section>
      <PageHeader title={`Hello, ${user?.name.split(' ')[0] ?? ''}`} description={`Company overview · ${formatDate(today)}`} />

      <div className="stat-grid">
        <StatTile to="/users" value={people.data?.total} label="Active people" />
        <StatTile to="/users?role=manager" value={managers.data?.total} label="Managers" />
        <StatTile to="/tasks" value={countOf(taskSummary.data?.by_status, 'not_started', 'in_progress', 'blocked')} label="Open tasks" />
        <StatTile to="/tasks?status=blocked" value={countOf(taskSummary.data?.by_status, 'blocked')} label="Blocked tasks" />
        <StatTile to="/leaves" value={pendingLeave.data?.total} label="Leave requests pending" />
        <StatTile to="/attendance" value={punched.data && people.data ? `${punched.data.total} / ${people.data.total}` : undefined} label="Punched in today" />
        <StatTile to="/service" value={countOf(serviceSummary.data?.by_status, ...ACTIVE_CALL_STATUSES)} label="Active service calls" />
        <StatTile to="/permissions" value={grants.data?.length} label="Extra permissions in force" />
      </div>


      <Section title="On leave today" action={<Link to="/calendar?show=leave">Leave calendar</Link>}>
        <QueryBoundary query={onLeave} skeleton={<Skeleton height={40} />} isEmpty={(rows) => rows.length === 0} empty={<p>Nobody is on approved leave today.</p>}>
          {(rows) => (
            <ul style={{ listStyle: 'none' }} className="stack">
              {rows.map((leave) => (
                <li key={leave.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                  <Link to={`/users/${leave.employee_id}`}>{leave.employee_id === user?.id ? 'You' : nameOf(leave.employee_id, '…')}</Link>
                  <span>
                    back after {formatDate(leave.end_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </Section>

      <Section title="Tasks by status" action={<Link to="/reports">Reports</Link>}>
        <QueryBoundary query={taskSummary} skeleton={<Skeleton height={60} />}>
          {(data) => <StatusBars title="Tasks by status" rows={data.by_status} table={TASK_STATUS} unit="tasks" emphasise="blocked" empty="No tasks yet." />}
        </QueryBoundary>
      </Section>

      <Section title="Leave waiting for a decision" action={<Link to="/leaves">All leave</Link>}>
        <QueryBoundary query={pendingLeave} skeleton={<Skeleton height={40} />} isEmpty={(data) => data.items.length === 0} empty={<p>No leave requests are pending.</p>}>
          {(data) => (
            <ul style={{ listStyle: 'none' }} className="stack">
              {data.items.map((leave) => (
                <li key={leave.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                  <span>
                    <Link to="/leaves">{nameOf(leave.employee_id, '…')}</Link> · waiting on {nameOf(leave.current_approver_id, '…')}
                  </span>
                  <span>
                    {formatDate(leave.start_date)}
                    {leave.start_date === leave.end_date ? '' : ` – ${formatDate(leave.end_date)}`} · {leaveDays(leave.leave_kind, leave.start_date, leave.end_date)}d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </Section>

      <Section title="Blocked tasks" action={<Link to="/tasks?status=blocked">View all</Link>}>
        <QueryBoundary query={blocked} skeleton={<Skeleton height={40} />} isEmpty={(data) => data.items.length === 0} empty={<p>Nothing is blocked.</p>}>
          {(data) => (
            <ul style={{ listStyle: 'none' }} className="stack">
              {data.items.map((task) => (
                <li key={task.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                  <Link to={`/tasks/${task.id}`}>{task.title}</Link>
                  <span>{nameOf(task.assigned_to, '…')}</span>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </Section>

      <Section title="Busiest right now" action={<Link to="/reports">Reports</Link>}>
        <QueryBoundary query={workload} skeleton={<Skeleton height={40} />} isEmpty={() => busiest.length === 0} empty={<p>No open tasks across the company.</p>}>
          {() => (
            <ul style={{ listStyle: 'none' }} className="stack">
              {busiest.map((row) => (
                <li key={row.user_id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                  <Link to={`/users/${row.user_id}`}>{nameOf(row.user_id, '…')}</Link>
                  <span>
                    {row.open_task_count} open {row.open_task_count === 1 ? 'task' : 'tasks'}
                    {row.active_service_assignment_count > 0 ? ` · ${row.active_service_assignment_count} service` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </Section>

      <Section title="Recent activity" action={<Link to="/audit-logs">Audit trail</Link>}>
        <QueryBoundary query={audit} skeleton={<Skeleton height={40} />} isEmpty={(data) => data.items.length === 0} empty={<p>Nothing has been recorded yet.</p>}>
          {(data) => (
            <ul style={{ listStyle: 'none' }} className="stack">
              {data.items.map((log) => (
                <li key={log.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                  <span>
                    <strong>{actionLabel(log.action)}</strong> · {log.actor_user_id ? nameOf(log.actor_user_id, '…') : 'System'}
                  </span>
                  <time dateTime={log.created_at}>{formatDateTime(log.created_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </Section>
    </section>
  )
}
