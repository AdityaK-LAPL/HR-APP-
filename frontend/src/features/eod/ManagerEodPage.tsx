import { FileText, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/fields'
import { useAuth } from '@/features/auth/authContext'
import { usePeople } from '@/features/people/usePeople'
import { useProjects } from '@/features/projects/queries'
import { useVisiblePeopleOptions } from '@/features/team/queries'
import { formatDate, formatDateTime } from '@/lib/dates'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { useEodList, type EodReport } from './queries'

const PAGE_SIZE = 20

/** Work reports from the team (and the manager's own), filterable by person, project and day. */
export function ManagerEodPage() {
  const { user } = useAuth()
  const [params, setParams] = useUrlParams({ view: 'team', person: '', project: '', date: '', page: '1' })
  const isOwner = user?.role === 'owner'
  const mine = !isOwner && params.view === 'mine'
  const page = pageNumber(params.page)
  const people = useVisiblePeopleOptions()
  const projects = useProjects({ page: 1, page_size: 100 })
  const query = useEodList({
    ...(mine ? { user_id: user?.id ?? '' } : params.person ? { user_id: params.person } : {}),
    ...(params.project ? { project_id: params.project } : {}),
    ...(params.date ? { report_date: params.date } : {}),
    page,
    page_size: PAGE_SIZE,
  })
  const { nameOf } = usePeople((query.data?.items ?? []).map((report) => report.user_id))
  const projectName = (id: string | null) =>
    id ? (projects.data?.items.find((project) => project.id === id)?.name ?? 'Project') : '—'
  const filtered = Boolean(params.person || params.project || params.date)

  const columns: Column<EodReport>[] = [
    { key: 'date', header: 'Report date', primary: true, cell: (r) => formatDate(r.report_date) },
    ...(mine ? [] : [{ key: 'who', header: 'Employee', cell: (r: EodReport) => (r.user_id === user?.id ? 'You' : nameOf(r.user_id, '…')) }]),
    { key: 'project', header: 'Project', cell: (r) => projectName(r.project_id) },
    { key: 'done', header: 'Work completed', cell: (r) => <span className="clamp-2">{r.work_completed ?? '—'}</span> },
    { key: 'issues', header: 'Issues', hideOnPhone: true, cell: (r) => <span className="clamp-2">{r.issues ?? '—'}</span> },
    { key: 'at', header: 'Submitted', hideOnPhone: true, cell: (r) => formatDateTime(r.submitted_at) },
  ]

  return (
    <section>
      <PageHeader
        title="EOD reports"
        description={isOwner ? 'Read the end-of-day reports of everyone in the company.' : "Read your team's end-of-day reports and submit your own."}
        actions={
          isOwner ? undefined : (
            <Link to="/eod/new" className="btn btn-primary">
              <Plus size={18} aria-hidden="true" /> Submit my report
            </Link>
          )
        }
      />
      {!isOwner && (
      <SegmentedControl
        label="Report view"
        value={mine ? 'mine' : 'team'}
        onChange={(view) => setParams({ view, person: '' })}
        options={[
          { value: 'team', label: 'Team reports' },
          { value: 'mine', label: 'My reports' },
        ]}
      />
      )}
      <div className="toolbar">
        {!mine && (
          <Select
            label="Employee"
            value={params.person}
            onChange={(event) => setParams({ person: event.target.value })}
            options={people.options}
            placeholder="Everyone"
          />
        )}
        <Select
          label="Project"
          value={params.project}
          onChange={(event) => setParams({ project: event.target.value })}
          options={(projects.data?.items ?? []).map((project) => ({ value: project.id, label: project.name }))}
          placeholder="All projects"
        />
        <Input label="Report date" type="date" value={params.date} onChange={(event) => setParams({ date: event.target.value })} />
        {filtered && (
          <Button variant="ghost" onClick={() => setParams({ person: '', project: '', date: '' })}>
            Clear filters
          </Button>
        )}
      </div>
      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<FileText size={24} />}
            title={filtered ? 'No reports match these filters' : mine ? 'You have not submitted a report yet' : 'No reports yet'}
            description={mine ? 'Submit a report at the end of each working day.' : 'Reports from your team appear here once they submit them.'}
          />
        }
      >
        {(data) => (
          <>
            <RecordList rows={data.items} columns={columns} rowKey={(r) => r.id} rowHref={(r) => `/eod/${r.id}`} caption="EOD reports" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
          </>
        )}
      </QueryBoundary>
    </section>
  )
}
