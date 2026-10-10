import { Link } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { StatTile } from '@/components/data/StatTile'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PunchCard } from '@/features/attendance/PunchCard'
import { useTeamAttendance } from '@/features/attendance/queries'
import { useAuth } from '@/features/auth/authContext'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { useLeaves } from '@/features/leave/queries'
import { usePeople } from '@/features/people/usePeople'
import { useTasks } from '@/features/tasks/queries'
import { countOf, useServiceSummary, useSubtree, useTaskSummary, useWorkload } from '@/features/team/queries'
import { formatDate, inclusiveDays } from '@/lib/dates'
import { PRIORITY, TASK_STATUS } from '@/lib/labels'

const ACTIVE_CALL_STATUSES = [
  'new', 'assigned', 'in_progress', 'waiting_customer', 'waiting_parts',
  'remote_support', 'field_visit_scheduled', 'field_visit_completed', 'reopened',
]

/**
 * "Team overview": the figures and short lists a manager scans each morning. Every number is the
 * API's own count for what this manager may see - nothing is computed from security rules here.
 */
export function ManagerDashboard() {
  const { user } = useAuth()
  const today = useCompanyToday()
  const subtree = useSubtree()
  const taskSummary = useTaskSummary()
  const serviceSummary = useServiceSummary()
  const pendingLeave = useLeaves({ status: 'pending', page: 1, page_size: 20 })
  const punched = useTeamAttendance({ start_date: today, end_date: today, page: 1, page_size: 1 })
  const blocked = useTasks({ status: 'blocked', page: 1, page_size: 5 })
  const todays = useTasks({ task_date: today, ...(user ? { assigned_to: user.id } : {}), page: 1, page_size: 5 })
  const workload = useWorkload()

  const active = subtree.people.filter((person) => person.is_active)
  const expected = active.length + 1 // the team, plus the manager
  const waitingForMe = (pendingLeave.data?.items ?? []).filter(
    (leave) => leave.current_approver_id === user?.id && leave.employee_id !== user?.id,
  )
  const busiest = [...(workload.data ?? [])]
    .filter((row) => row.open_task_count > 0)
    .sort((a, b) => b.open_task_count - a.open_task_count)
    .slice(0, 5)
  const { nameOf } = usePeople([
    ...waitingForMe.map((leave) => leave.employee_id),
    ...(blocked.data?.items ?? []).map((task) => task.assigned_to),
    ...busiest.map((row) => row.user_id),
  ])

  return (
    <section>
      <PageHeader title={`Hello, ${user?.name.split(' ')[0] ?? ''}`} description={`Team overview · ${formatDate(today)}`} />

      <div className="stat-grid">
        <StatTile to="/users" value={subtree.isLoading ? undefined : active.length} label="People in my team" />
        <StatTile to="/tasks" value={countOf(taskSummary.data?.by_status, 'not_started', 'in_progress', 'blocked')} label="Open team tasks" />
        <StatTile to="/tasks?status=blocked" value={countOf(taskSummary.data?.by_status, 'blocked')} label="Blocked tasks" />
        <StatTile to="/leaves" value={pendingLeave.data?.total} label="Leave requests pending" />
        <StatTile to="/attendance" value={punched.data ? `${punched.data.total} / ${expected}` : undefined} label="Punched in today" />
        <StatTile to="/service" value={countOf(serviceSummary.data?.by_status, ...ACTIVE_CALL_STATUSES)} label="Active service calls" />
      </div>

      <PunchCard />

      <Section title="Waiting for your decision" action={<Link to="/leaves">All leave</Link>}>
        <QueryBoundary
          query={pendingLeave}
          skeleton={<Skeleton height={40} />}
          isEmpty={() => waitingForMe.length === 0}
          empty={<p>No leave requests are waiting for you.</p>}
        >
          {() => (
            <ul style={{ listStyle: 'none' }} className="stack">
              {waitingForMe.slice(0, 5).map((leave) => (
                <li key={leave.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                  <Link to="/leaves">{nameOf(leave.employee_id, '…')}</Link>
                  <span>
                    {formatDate(leave.start_date)}
                    {leave.start_date === leave.end_date ? '' : ` – ${formatDate(leave.end_date)}`} · {inclusiveDays(leave.start_date, leave.end_date)}d
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

      <Section title="Busiest right now">
        <QueryBoundary query={workload} skeleton={<Skeleton height={40} />} isEmpty={() => busiest.length === 0} empty={<p>No open tasks across the team.</p>}>
          {() => (
            <ul style={{ listStyle: 'none' }} className="stack">
              {busiest.map((row) => (
                <li key={row.user_id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                  <Link to={`/users/${row.user_id}`}>{row.user_id === user?.id ? 'You' : nameOf(row.user_id, '…')}</Link>
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

      <Section title="My tasks today" action={<Link to={`/tasks?assignee=${user?.id ?? ''}&date=${today}`}>All mine</Link>}>
        <QueryBoundary query={todays} skeleton={<Skeleton height={40} />} isEmpty={(data) => data.items.length === 0} empty={<p>Nothing scheduled for you today.</p>}>
          {(data) => (
            <ul style={{ listStyle: 'none' }} className="stack">
              {data.items.map((task) => (
                <li key={task.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                  <Link to={`/tasks/${task.id}`}>{task.title}</Link>
                  <span className="meta-line">
                    <StatusBadge table={PRIORITY} value={task.priority} />
                    <StatusBadge table={TASK_STATUS} value={task.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </Section>
    </section>
  )
}
