import { Briefcase, Plus } from 'lucide-react'
import { useState } from 'react'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/features/auth/authContext'
import { Can } from '@/features/permissions/Can'
import { usePeople } from '@/features/people/usePeople'
import { formatDate } from '@/lib/dates'
import { PROJECT_STATUS, optionsOf } from '@/lib/labels'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { ProjectFormDialog } from './ProjectFormDialog'
import { useProjects, type Project } from './queries'

const PAGE_SIZE = 20

export function ProjectsPage() {
  const { user } = useAuth()
  const isManager = user?.role === 'manager'
  const [params, setParams] = useUrlParams({ status: '', scope: '', page: '1' })
  const [creating, setCreating] = useState(false)
  const page = pageNumber(params.page)
  const query = useProjects({
    ...(params.status ? { status: params.status } : {}),
    ...(isManager && params.scope === 'managed' && user ? { manager_id: user.id } : {}),
    page,
    page_size: PAGE_SIZE,
  })
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
      <PageHeader
        title={isManager ? 'Projects' : 'My projects'}
        description={isManager ? 'Projects you manage, your team is part of, or have been given access to.' : 'Projects you have been added to.'}
        actions={
          isManager ? (
            <Can permission="create_project">
              <Button icon={<Plus size={18} />} onClick={() => setCreating(true)}>
                New project
              </Button>
            </Can>
          ) : undefined
        }
      />
      <div className="toolbar">
        {isManager && (
          <Select
            label="Show"
            value={params.scope}
            onChange={(event) => setParams({ scope: event.target.value })}
            options={[{ value: 'managed', label: 'Managed by me' }]}
            placeholder="All visible projects"
          />
        )}
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
            description={params.status ? 'Try another status.' : isManager ? 'Create a project to allocate your team to it.' : 'Projects you are added to will appear here.'}
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
      {isManager && <ProjectFormDialog open={creating} onClose={() => setCreating(false)} />}
    </section>
  )
}
