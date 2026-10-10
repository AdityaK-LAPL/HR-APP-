import { Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/fields'
import { useAuth } from '@/features/auth/authContext'
import { usePeople } from '@/features/people/usePeople'
import { labelOfRole } from '@/features/profile/roles'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { OrgStructure } from './OrgStructure'
import { useVisibleUsers, useWorkload, type Person } from './queries'

const PAGE_SIZE = 20

function ActiveBadge({ active }: { active: boolean }) {
  return <span className={`badge ${active ? 'badge-success' : 'badge-neutral'}`}>{active ? 'Active' : 'Inactive'}</span>
}

/** The people the manager can see: their team, with workload, plus the reporting structure. */
export function TeamPage() {
  const { user } = useAuth()
  const [params, setParams] = useUrlParams({ view: 'people', q: '', role: '', state: 'active', page: '1' })
  const [searchInput, setSearchInput] = useState(params.q)
  const search = useDebouncedValue(searchInput.trim())
  const page = pageNumber(params.page)
  const structure = params.view === 'structure'

  const query = useVisibleUsers(
    {
      ...(search ? { search } : {}),
      ...(params.role ? { role: params.role } : {}),
      ...(params.state !== 'all' ? { is_active: params.state === 'active' } : {}),
      page,
      page_size: PAGE_SIZE,
    },
    !structure,
  )
  const workload = useWorkload()
  const load = new Map((workload.data ?? []).map((row) => [row.user_id, row]))
  const { nameOf } = usePeople((query.data?.items ?? []).map((person) => person.manager_id))
  const filtered = Boolean(search || params.role || params.state !== 'active')

  const columns: Column<Person>[] = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      cell: (p) => (
        <>
          {p.name}
          {p.id === user?.id ? ' (you)' : ''}
        </>
      ),
    },
    { key: 'code', header: 'Employee ID', cell: (p) => p.employee_code },
    { key: 'designation', header: 'Designation', hideOnPhone: true, cell: (p) => p.designation ?? '—' },
    { key: 'role', header: 'Role', cell: (p) => labelOfRole(p.role) },
    { key: 'manager', header: 'Reports to', hideOnPhone: true, cell: (p) => (p.manager_id ? nameOf(p.manager_id, '…') : '—') },
    { key: 'tasks', header: 'Open tasks', cell: (p) => load.get(p.id)?.open_task_count ?? (workload.isPending ? '…' : 0) },
    { key: 'calls', header: 'Service calls', hideOnPhone: true, cell: (p) => load.get(p.id)?.active_service_assignment_count ?? (workload.isPending ? '…' : 0) },
    { key: 'state', header: 'Status', cell: (p) => <ActiveBadge active={p.is_active} /> },
  ]

  return (
    <section>
      <PageHeader title="My team" description="The people you manage, what they are working on, and how they report." />
      <SegmentedControl
        label="Team view"
        value={structure ? 'structure' : 'people'}
        onChange={(view) => setParams({ view })}
        options={[
          { value: 'people', label: 'People' },
          { value: 'structure', label: 'Reporting structure' },
        ]}
      />
      {structure ? (
        <OrgStructure />
      ) : (
        <>
          <div className="toolbar">
            <Input
              label="Search"
              placeholder="Name, ID or designation"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value)
                setParams({ q: event.target.value.trim() })
              }}
            />
            <Select
              label="Role"
              value={params.role}
              onChange={(event) => setParams({ role: event.target.value })}
              options={[
                { value: 'manager', label: 'Managers' },
                { value: 'employee', label: 'Employees' },
              ]}
              placeholder="All roles"
            />
            <Select
              label="Status"
              value={params.state}
              onChange={(event) => setParams({ state: event.target.value })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'all', label: 'All' },
              ]}
            />
          </div>
          <QueryBoundary
            query={query}
            isEmpty={(data) => data.items.length === 0}
            empty={
              <EmptyState
                icon={<Users size={24} />}
                title={filtered ? 'No one matches' : 'No one reports to you yet'}
                description={filtered ? 'Try different filters.' : 'People assigned to you by the Owner appear here.'}
              />
            }
          >
            {(data) => (
              <>
                <RecordList rows={data.items} columns={columns} rowKey={(p) => p.id} rowHref={(p) => `/users/${p.id}`} caption="Team members" />
                <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
              </>
            )}
          </QueryBoundary>
          <p style={{ marginTop: 12, fontSize: 13 }}>
            <Link to="/tasks">Team tasks</Link> · <Link to="/attendance">Team attendance</Link> · <Link to="/calendar">Team calendar</Link>
          </p>
        </>
      )}
    </section>
  )
}
