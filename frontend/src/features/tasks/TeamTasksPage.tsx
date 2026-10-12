import { CheckSquare, Plus } from 'lucide-react'
import { useState } from 'react'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/features/auth/authContext'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { usePeople } from '@/features/people/usePeople'
import { useProjects } from '@/features/projects/queries'
import { countOf, useTaskSummary, useVisiblePeopleOptions } from '@/features/team/queries'
import { formatDate } from '@/lib/dates'
import { PRIORITY, TASK_STATUS, optionsOf } from '@/lib/labels'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { isOverdue } from './logic'
import { TaskFormDialog } from './TaskFormDialog'
import { useTasks, type Task } from './queries'

const PAGE_SIZE = 20

/** Team task monitoring and assignment. Which tasks appear is decided by the API (own + reporting subtree + grants). */
export function TeamTasksPage() {
  const { user } = useAuth()
  const today = useCompanyToday()
  const [params, setParams] = useUrlParams({ status: '', assignee: '', project: '', date: '', page: '1' })
  const page = pageNumber(params.page)
  const [assigning, setAssigning] = useState(false)
  const people = useVisiblePeopleOptions()
  const projects = useProjects({ page: 1, page_size: 100 })
  const summary = useTaskSummary()
  const query = useTasks({
    ...(params.status ? { status: params.status } : {}),
    ...(params.assignee ? { assigned_to: params.assignee } : {}),
    ...(params.project ? { project_id: params.project } : {}),
    ...(params.date ? { task_date: params.date } : {}),
    page,
    page_size: PAGE_SIZE,
  })
  const { nameOf } = usePeople((query.data?.items ?? []).flatMap((task) => [task.assigned_to, task.assigned_by]))
  const filtered = Boolean(params.status || params.assignee || params.project || params.date)

  const columns: Column<Task>[] = [
    { key: 'title', header: 'Task', primary: true, cell: (t) => t.title },
    { key: 'to', header: 'Assigned to', cell: (t) => nameOf(t.assigned_to, '…') },
    { key: 'status', header: 'Status', cell: (t) => <StatusBadge table={TASK_STATUS} value={t.status} /> },
    { key: 'priority', header: 'Priority', cell: (t) => <StatusBadge table={PRIORITY} value={t.priority} /> },
    { key: 'date', header: 'Task date', hideOnPhone: true, cell: (t) => formatDate(t.task_date) || '—' },
    {
      key: 'due',
      header: 'Due',
      cell: (t) => (
        <>
          {formatDate(t.due_date) || '—'}
          {isOverdue(t, today) && (
            <>
              {' '}
              <span className="badge badge-danger">Overdue</span>
            </>
          )}
        </>
      ),
    },
    { key: 'by', header: 'Assigned by', hideOnPhone: true, cell: (t) => (t.assigned_by === user?.id ? 'You' : nameOf(t.assigned_by, '…')) },
  ]

  const open = countOf(summary.data?.by_status, 'not_started', 'in_progress', 'blocked')
  const blocked = countOf(summary.data?.by_status, 'blocked')

  return (
    <section>
      <PageHeader
        title={user?.role === 'owner' ? 'Company tasks' : 'Team tasks'}
        description={user?.role === 'owner' ? 'All work across the company: monitor it, assign new tasks and reassign existing ones.' : "Monitor your team's work, assign new tasks and reassign existing ones."}
        actions={
          <Button icon={<Plus size={18} />} onClick={() => setAssigning(true)}>
            Assign a task
          </Button>
        }
      />

      <div className="stat-grid">
        <button type="button" className="stat glass-card" onClick={() => setParams({ status: '' })}>
          <div className="stat-value">{open ?? '…'}</div>
          <div className="stat-label">Open tasks</div>
        </button>
        <button type="button" className="stat glass-card" onClick={() => setParams({ status: 'blocked' })} aria-label={`Blocked tasks: ${blocked ?? 'loading'}. Show them.`}>
          <div className="stat-value">{blocked ?? '…'}</div>
          <div className="stat-label">Blocked</div>
        </button>
        <button type="button" className="stat glass-card" onClick={() => setParams({ status: '', date: '' })}>
          <div className="stat-value">{summary.data?.total ?? '…'}</div>
          <div className="stat-label">All tasks</div>
        </button>
      </div>

      <div className="toolbar">
        <Select
          label="Assigned to"
          value={params.assignee}
          onChange={(event) => setParams({ assignee: event.target.value })}
          options={people.options}
          placeholder="Everyone"
        />
        <Select
          label="Status"
          value={params.status}
          onChange={(event) => setParams({ status: event.target.value })}
          options={optionsOf(TASK_STATUS)}
          placeholder="All statuses"
        />
        <Select
          label="Project"
          value={params.project}
          onChange={(event) => setParams({ project: event.target.value })}
          options={(projects.data?.items ?? []).map((project) => ({ value: project.id, label: project.name }))}
          placeholder="All projects"
        />
        <Input label="Task date" type="date" value={params.date} onChange={(event) => setParams({ date: event.target.value })} />
        <Button
          variant={params.date === today ? 'primary' : 'outline'}
          onClick={() => setParams({ date: params.date === today ? '' : today })}
          aria-pressed={params.date === today}
        >
          Today
        </Button>
        {filtered && (
          <Button variant="ghost" onClick={() => setParams({ status: '', assignee: '', project: '', date: '' })}>
            Clear filters
          </Button>
        )}
      </div>

      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<CheckSquare size={24} />}
            title={filtered ? 'No tasks match these filters' : 'No tasks yet'}
            description={filtered ? 'Clear the filters to see everything.' : 'Assign a task to get your team started.'}
            action={
              filtered ? undefined : (
                <Button icon={<Plus size={18} />} onClick={() => setAssigning(true)}>
                  Assign a task
                </Button>
              )
            }
          />
        }
      >
        {(data) => (
          <>
            <RecordList rows={data.items} columns={columns} rowKey={(t) => t.id} rowHref={(t) => `/tasks/${t.id}`} caption="Tasks" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
          </>
        )}
      </QueryBoundary>

      <TaskFormDialog open={assigning} onClose={() => setAssigning(false)} defaultAssignee={params.assignee || undefined} />
    </section>
  )
}
