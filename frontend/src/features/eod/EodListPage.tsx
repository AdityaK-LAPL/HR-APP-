import { FileText, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { useProjects } from '@/features/projects/queries'
import { formatDate, formatDateTime } from '@/lib/dates'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { useEodList, type EodReport } from './queries'

const PAGE_SIZE = 20

export function EodListPage() {
  const [params, setParams] = useUrlParams({ date: '', page: '1' })
  const page = pageNumber(params.page)
  const query = useEodList({ ...(params.date ? { report_date: params.date } : {}), page, page_size: PAGE_SIZE })
  const projects = useProjects({ page: 1, page_size: 100 })
  const projectName = (id: string | null) =>
    id ? (projects.data?.items.find((project) => project.id === id)?.name ?? 'Project') : '—'

  const columns: Column<EodReport>[] = [
    { key: 'date', header: 'Report date', primary: true, cell: (r) => formatDate(r.report_date) },
    { key: 'project', header: 'Project', cell: (r) => projectName(r.project_id) },
    {
      key: 'done',
      header: 'Work completed',
      cell: (r) => <span className="clamp-2">{r.work_completed ?? '—'}</span>,
    },
    { key: 'at', header: 'Submitted', hideOnPhone: true, cell: (r) => formatDateTime(r.submitted_at) },
  ]

  return (
    <section>
      <PageHeader
        title="My EOD reports"
        description="Your end-of-day work reports. Submitted reports are kept as a record and cannot be edited."
        actions={
          <Link to="/eod/new" className="btn btn-primary">
            <Plus size={18} aria-hidden="true" /> Submit today&apos;s report
          </Link>
        }
      />
      <div className="toolbar">
        <Input label="Report date" type="date" value={params.date} onChange={(e) => setParams({ date: e.target.value })} />
        {params.date && (
          <Button variant="ghost" onClick={() => setParams({ date: '' })}>
            Clear
          </Button>
        )}
      </div>
      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<FileText size={24} />}
            title={params.date ? 'No report for that date' : 'No reports submitted yet'}
            description="Submit a report at the end of each working day."
          />
        }
      >
        {(data) => (
          <>
            <RecordList
              rows={data.items}
              columns={columns}
              rowKey={(r) => r.id}
              rowHref={(r) => `/eod/${r.id}`}
              caption="EOD reports"
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
          </>
        )}
      </QueryBoundary>
    </section>
  )
}
