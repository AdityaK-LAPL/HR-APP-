import { KeyRound, Pencil, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { UseQueryResult } from '@tanstack/react-query'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useTeamAttendance } from '@/features/attendance/queries'
import { useAuth } from '@/features/auth/authContext'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { useEodList } from '@/features/eod/queries'
import { useLeaves } from '@/features/leave/queries'
import { usePeople } from '@/features/people/usePeople'
import { labelOfRole } from '@/features/profile/roles'
import { useServiceCalls } from '@/features/service/queries'
import { TaskFormDialog } from '@/features/tasks/TaskFormDialog'
import { useTasks } from '@/features/tasks/queries'
import { addDays } from '@/lib/calendar'
import { formatDate, formatDuration, formatTime, inclusiveDays } from '@/lib/dates'
import { ATTENDANCE_STATUS, LEAVE_STATUS, SERVICE_STATUS, TASK_STATUS } from '@/lib/labels'
import { EditPersonDialog } from './EditPersonDialog'
import { ResetPasswordDialog } from './ResetPasswordDialog'
import { useAssignableUsers, usePerson, useSubtree, useVisibleUsers } from './queries'

/** A short recent-activity list with a link to the full, filtered list. */
function Recent<T extends { items: unknown[] }>({
  title,
  query,
  all,
  empty,
  render,
}: {
  title: string
  query: UseQueryResult<T>
  all: string
  empty: string
  render: (item: T['items'][number]) => ReactNode
}) {
  return (
    <Section title={title} action={<Link to={all}>View all</Link>}>
      <QueryBoundary query={query} skeleton={<Skeleton height={40} />} isEmpty={(data) => data.items.length === 0} empty={<p>{empty}</p>}>
        {(data) => (
          <ul style={{ listStyle: 'none' }} className="stack">
            {data.items.map((item, index) => (
              <li key={index} className="meta-line" style={{ justifyContent: 'space-between' }}>
                {render(item)}
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
    </Section>
  )
}

/** One person within the manager's scope: profile, what they are working on, and quick actions. */
export function PersonPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const today = useCompanyToday()
  const person = usePerson(id)
  const subtree = useSubtree()
  const assignable = useAssignableUsers()
  const [assigning, setAssigning] = useState(false)
  const [editing, setEditing] = useState(false)
  const [resetting, setResetting] = useState(false)

  const tasks = useTasks({ assigned_to: id, page: 1, page_size: 5 })
  const leaves = useLeaves({ employee_id: id, page: 1, page_size: 5 })
  const eods = useEodList({ user_id: id, page: 1, page_size: 5 })
  const attendance = useTeamAttendance({ user_id: id, start_date: addDays(today, -6), end_date: today, page: 1, page_size: 7 })
  const calls = useServiceCalls({ employee_id: id, page: 1, page_size: 5 })
  const reports = useVisibleUsers({ manager_id: id, page: 1, page_size: 50 })
  const { nameOf } = usePeople([person.data?.manager_id])

  return (
    <QueryBoundary query={person}>
      {(data) => {
        const isSelf = data.id === user?.id
        // Profile edits and password resets are for people in the manager's own reporting line.
        const inTeam = subtree.ids.has(data.id)
        const canAssign = assignable.options.some((option) => option.value === data.id)
        return (
          <section>
            <PageHeader
              back={<BackLink to="/users">My team</BackLink>}
              title={data.name}
              description={`${data.employee_code}${data.designation ? ` · ${data.designation}` : ''}`}
              actions={
                <>
                  {canAssign && data.is_active && (
                    <Button icon={<Plus size={16} />} onClick={() => setAssigning(true)}>
                      Assign a task
                    </Button>
                  )}
                  {(inTeam || isSelf) && (
                    <Button variant="outline" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>
                      Edit profile
                    </Button>
                  )}
                  {inTeam && (
                    <Button variant="outline" icon={<KeyRound size={16} />} onClick={() => setResetting(true)}>
                      Reset password
                    </Button>
                  )}
                </>
              }
            />

            <Section title="Profile">
              <dl className="facts">
                <dt>Role</dt>
                <dd>{labelOfRole(data.role)}</dd>
                <dt>Status</dt>
                <dd>
                  <span className={`badge ${data.is_active ? 'badge-success' : 'badge-neutral'}`}>{data.is_active ? 'Active' : 'Inactive'}</span>
                </dd>
                <dt>Reports to</dt>
                <dd>
                  {data.manager_id ? (
                    data.manager_id === user?.id ? (
                      'You'
                    ) : (
                      nameOf(data.manager_id, '…')
                    )
                  ) : (
                    '—'
                  )}
                </dd>
                {!inTeam && !isSelf && <><dt>Access</dt><dd>View only (outside your own reporting line)</dd></>}
              </dl>
            </Section>

            {data.role === 'manager' && (
              <Section title="Direct reports">
                <QueryBoundary query={reports} skeleton={<Skeleton height={40} />} isEmpty={(r) => r.items.length === 0} empty={<p>No direct reports.</p>}>
                  {(r) => (
                    <ul style={{ listStyle: 'none' }} className="stack">
                      {r.items.map((report) => (
                        <li key={report.id}>
                          <Link to={`/users/${report.id}`}>{report.name}</Link>
                          {report.designation ? ` · ${report.designation}` : ''}
                          {!report.is_active ? ' (inactive)' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </QueryBoundary>
              </Section>
            )}

            <Recent
              title="Recent tasks"
              query={tasks}
              all={`/tasks?assignee=${data.id}`}
              empty="No tasks."
              render={(task) => (
                <>
                  <Link to={`/tasks/${task.id}`}>{task.title}</Link>
                  <StatusBadge table={TASK_STATUS} value={task.status} />
                </>
              )}
            />
            <Recent
              title="Leave"
              query={leaves}
              all={`/leaves?person=${data.id}&status=all`}
              empty="No leave requests."
              render={(leave) => (
                <>
                  <span>
                    {leave.start_date === leave.end_date ? formatDate(leave.start_date) : `${formatDate(leave.start_date)} – ${formatDate(leave.end_date)}`}
                    {` · ${inclusiveDays(leave.start_date, leave.end_date)}d`}
                  </span>
                  <StatusBadge table={LEAVE_STATUS} value={leave.status} />
                </>
              )}
            />
            <Recent
              title="Attendance, last 7 days"
              query={attendance}
              all={`/attendance?person=${data.id}&from=${addDays(today, -29)}&to=${today}`}
              empty="No punches in the last 7 days."
              render={(day) => (
                <>
                  <span>
                    {formatDate(day.work_date)} · {formatTime(day.punch_in_time) || '—'} – {formatTime(day.punch_out_time) || '—'}
                    {day.total_duration_minutes ? ` · ${formatDuration(day.total_duration_minutes)}` : ''}
                  </span>
                  <StatusBadge table={ATTENDANCE_STATUS} value={day.status} />
                </>
              )}
            />
            <Recent
              title="Recent EOD reports"
              query={eods}
              all={`/eod?person=${data.id}`}
              empty="No reports submitted."
              render={(report) => (
                <>
                  <Link to={`/eod/${report.id}`}>{formatDate(report.report_date)}</Link>
                  <span className="clamp-2">{report.work_completed ?? ''}</span>
                </>
              )}
            />
            <Recent
              title="Service calls"
              query={calls}
              all={`/service?employee=${data.id}`}
              empty="Not assigned to any service call."
              render={(call) => (
                <>
                  <Link to={`/service/${call.id}`}>{call.service_call_code}</Link>
                  <StatusBadge table={SERVICE_STATUS} value={call.status} />
                </>
              )}
            />

            <TaskFormDialog open={assigning} onClose={() => setAssigning(false)} defaultAssignee={data.id} />
            {(inTeam || isSelf) && <EditPersonDialog person={data} open={editing} onClose={() => setEditing(false)} />}
            {inTeam && <ResetPasswordDialog person={data} open={resetting} onClose={() => setResetting(false)} />}
          </section>
        )
      }}
    </QueryBoundary>
  )
}
