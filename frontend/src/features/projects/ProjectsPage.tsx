import { Briefcase } from 'lucide-react'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { usePeople } from '@/features/people/usePeople'
import { formatDate } from '@/lib/dates'
import { PROJECT_STATUS, optionsOf } from '@/lib/labels'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { useProjects, type Project } from './queries'

const PAGE_SIZE = 20

export function ProjectsPage() {
  const [params, setParams] = useUrlParams({ status: '', page: '1' })
  const page = pageNumber(params.page)
  const query = useProjects({ ...(params.status ? { status: params.status } : {}), page, page_size: PAGE_SIZE })
  const { nameOf } = usePeople((query.data?.items ?? []).map((project) => project.owning_manager_id))

  const columns: Column<Project>[] = [
    { key: 'name', header: 'Project', primary: true, cell: (p) => p.name },
    { key: 'status', header: 'Status', cell: (p) => <StatusBadge table={PROJECT_STATUS} value={p.status} /> },
    { key: 'manager', header: 'Managed by', cell: (p) => nameOf(p.owning_manager_id, '…') },
    { key: 'start', header: 'Starts', cell: (p) => formatDate(p.start_date) || '—' },
    { key: 'end', header: 'Expected end', cell: (p) => formatDate(p.expected_end_date) || '—' },
  ]

  return (
    <section>
      <PageHeader title="My projects" description="Projects you have been added to." />
      <div className="toolbar">
        <Select
          label="Status"
          value={params.status}
          onChange={(event) => setParams({ status: event.target.value })}
          options={optionsOf(PROJECT_STATUS)}
          placeholder="All statuses"
        />
      </div>
      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<Briefcase size={24} />}
            title={params.status ? 'No projects with that status' : 'No projects yet'}
            description={params.status ? 'Try another status.' : 'Projects you are added to will appear here.'}
          />
        }
      >
        {(data) => (
          <>
            <RecordList
              rows={data.items}
              columns={columns}
              rowKey={(p) => p.id}
              rowHref={(p) => `/projects/${p.id}`}
              caption="Projects"
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
          </>
        )}
      </QueryBoundary>
    </section>
  )
}
