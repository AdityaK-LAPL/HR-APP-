import { CheckSquare } from 'lucide-react'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { usePeople } from '@/features/people/usePeople'
import { formatDate } from '@/lib/dates'
import { PRIORITY, TASK_STATUS, optionsOf } from '@/lib/labels'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { isOverdue } from './logic'
import { useTasks, type Task } from './queries'

const PAGE_SIZE = 20

export function TasksPage() {
  const today = useCompanyToday()
  const [params, setParams] = useUrlParams({ status: '', date: '', page: '1' })
  const page = pageNumber(params.page)
  const query = useTasks({
    ...(params.status ? { status: params.status } : {}),
    ...(params.date ? { task_date: params.date } : {}),
    page,
    page_size: PAGE_SIZE,
  })
  const { nameOf } = usePeople((query.data?.items ?? []).map((task) => task.assigned_by))
  const filtered = Boolean(params.status || params.date)

  const columns: Column<Task>[] = [
    { key: 'title', header: 'Task', primary: true, cell: (t) => t.title },
    { key: 'status', header: 'Status', cell: (t) => <StatusBadge table={TASK_STATUS} value={t.status} /> },
    { key: 'priority', header: 'Priority', cell: (t) => <StatusBadge table={PRIORITY} value={t.priority} /> },
    { key: 'date', header: 'Task date', cell: (t) => formatDate(t.task_date) || '—' },
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
    { key: 'by', header: 'Assigned by', hideOnPhone: true, cell: (t) => nameOf(t.assigned_by, '…') },
  ]

  return (
    <section>
      <PageHeader title="My tasks" description="Work assigned to you. Open a task to update its status." />
      <div className="toolbar">
        <Select
          label="Status"
          value={params.status}
          onChange={(event) => setParams({ status: event.target.value })}
          options={optionsOf(TASK_STATUS)}
          placeholder="All statuses"
        />
        <Input
          label="Task date"
          type="date"
          value={params.date}
          onChange={(event) => setParams({ date: event.target.value })}
        />
        <Button
          variant={params.date === today ? 'primary' : 'outline'}
          onClick={() => setParams({ date: params.date === today ? '' : today })}
          aria-pressed={params.date === today}
        >
          Today
        </Button>
        {filtered && (
          <Button variant="ghost" onClick={() => setParams({ status: '', date: '' })}>
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
            title={filtered ? 'No tasks match these filters' : 'No tasks assigned to you'}
            description={filtered ? 'Clear the filters to see everything.' : 'When a manager assigns you work, it shows up here.'}
          />
        }
      >
        {(data) => (
          <>
            <RecordList
              rows={data.items}
              columns={columns}
              rowKey={(t) => t.id}
              rowHref={(t) => `/tasks/${t.id}`}
              caption="Tasks"
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
          </>
        )}
      </QueryBoundary>
    </section>
  )
}
