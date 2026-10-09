import { Link } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PunchCard } from '@/features/attendance/PunchCard'
import { useAuth } from '@/features/auth/authContext'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { useLeaves } from '@/features/leave/queries'
import { useCustomerNames, useServiceCalls } from '@/features/service/queries'
import { useTasks } from '@/features/tasks/queries'
import { formatDate } from '@/lib/dates'
import { PRIORITY, SERVICE_STATUS, TASK_STATUS } from '@/lib/labels'

function Tile({ to, value, label }: { to: string; value: number | undefined; label: string }) {
  return (
    <Link to={to} className="stat glass-card" style={{ display: 'block', color: 'inherit' }}>
      <div className="stat-value">{value === undefined ? <Skeleton height={32} width={48} /> : value}</div>
      <div className="stat-label">{label}</div>
    </Link>
  )
}

/** "My day": what needs doing today, attendance, and what is waiting. All figures come from the API. */
export function EmployeeDashboard() {
  const { user } = useAuth()
  const today = useCompanyToday()
  const todays = useTasks({ task_date: today, page: 1, page_size: 5 })
  const inProgress = useTasks({ status: 'in_progress', page: 1, page_size: 1 })
  const pendingLeave = useLeaves({ status: 'pending', page: 1, page_size: 1 })
  const calls = useServiceCalls({ page: 1, page_size: 5 })
  const customerName = useCustomerNames((calls.data?.items ?? []).map((call) => call.customer_id))

  return (
    <section>
      <PageHeader title={`Hello, ${user?.name.split(' ')[0] ?? ''}`} description={formatDate(today)} />

      <div className="stat-grid">
        <Tile to={`/tasks?date=${today}`} value={todays.data?.total} label="Tasks today" />
        <Tile to="/tasks?status=in_progress" value={inProgress.data?.total} label="In progress" />
        <Tile to="/leaves?status=pending" value={pendingLeave.data?.total} label="Leave awaiting approval" />
        <Tile to="/service" value={calls.data?.total} label="Service calls" />
      </div>

      <PunchCard />

      <Section title="Today's tasks" action={<Link to="/tasks">All tasks</Link>}>
        <QueryBoundary query={todays} isEmpty={(data) => data.items.length === 0} empty={<p>Nothing scheduled for today.</p>}>
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

      <Section title="My service calls" action={<Link to="/service">All calls</Link>}>
        <QueryBoundary query={calls} isEmpty={(data) => data.items.length === 0} empty={<p>No service calls assigned to you.</p>}>
          {(data) => (
            <ul style={{ listStyle: 'none' }} className="stack">
              {data.items.map((call) => (
                <li key={call.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                  <Link to={`/service/${call.id}`}>
                    {call.service_call_code} · {customerName(call.customer_id)}
                  </Link>
                  <StatusBadge table={SERVICE_STATUS} value={call.status} />
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </Section>
    </section>
  )
}
