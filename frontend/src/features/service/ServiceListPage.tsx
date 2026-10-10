import { Wrench } from 'lucide-react'
import { useState } from 'react'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/features/auth/authContext'
import { usePeople } from '@/features/people/usePeople'
import { useVisiblePeopleOptions } from '@/features/team/queries'
import { formatDateTime } from '@/lib/dates'
import { PRIORITY, SERVICE_STATUS, SERVICE_TYPE, labelOf, optionsOf } from '@/lib/labels'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { useCustomerNames, useServiceCalls, type ServiceCall } from './queries'

const PAGE_SIZE = 20

export function ServiceListPage() {
  const { user } = useAuth()
  const isEmployee = user?.role === 'employee'
  const [params, setParams] = useUrlParams({ status: '', code: '', employee: '', scope: '', customer: '', page: '1' })
  const people = useVisiblePeopleOptions()
  const [codeInput, setCodeInput] = useState(params.code)
  const code = useDebouncedValue(codeInput.trim())
  const page = pageNumber(params.page)
  const query = useServiceCalls({
    ...(params.status ? { status: params.status } : {}),
    ...(code ? { service_call_code: code } : {}),
    ...(!isEmployee && params.employee ? { employee_id: params.employee } : {}),
    ...(!isEmployee && params.scope === 'responsible' && user ? { manager_id: user.id } : {}),
    ...(!isEmployee && params.customer ? { customer_id: params.customer } : {}),
    page,
    page_size: PAGE_SIZE,
  })
  const customerName = useCustomerNames((query.data?.items ?? []).map((call) => call.customer_id))
  const { nameOf } = usePeople((query.data?.items ?? []).map((call) => call.responsible_manager_id))
  const filtered = Boolean(params.status || code || params.employee || params.scope || params.customer)

  const columns: Column<ServiceCall>[] = [
    { key: 'code', header: 'Call', primary: true, cell: (c) => c.service_call_code },
    { key: 'customer', header: 'Customer', cell: (c) => customerName(c.customer_id) },
    { key: 'status', header: 'Status', cell: (c) => <StatusBadge table={SERVICE_STATUS} value={c.status} /> },
    { key: 'priority', header: 'Priority', cell: (c) => <StatusBadge table={PRIORITY} value={c.priority} /> },
    ...(isEmployee
      ? []
      : [{ key: 'manager', header: 'Responsible', hideOnPhone: true, cell: (c: ServiceCall) => (c.responsible_manager_id === user?.id ? 'You' : nameOf(c.responsible_manager_id, '…')) }]),
    { key: 'type', header: 'Type', hideOnPhone: true, cell: (c) => labelOf(SERVICE_TYPE, c.service_type) },
    { key: 'issue', header: 'Issue', hideOnPhone: true, cell: (c) => <span className="clamp-2">{c.issue_reported}</span> },
    { key: 'contacted', header: 'Reported', cell: (c) => formatDateTime(c.contacted_at) },
  ]

  return (
    <section>
      <PageHeader
        title={isEmployee ? 'My service calls' : 'Service calls'}
        description={isEmployee ? 'Customer calls you are assigned to.' : 'Customer calls you are responsible for or your team is working on.'}
      />
      <div className="toolbar">
        <Select
          label="Status"
          value={params.status}
          onChange={(event) => setParams({ status: event.target.value })}
          options={optionsOf(SERVICE_STATUS)}
          placeholder="All statuses"
        />
        {!isEmployee && (
          <>
            <Select
              label="Assigned to"
              value={params.employee}
              onChange={(event) => setParams({ employee: event.target.value })}
              options={people.options}
              placeholder="Anyone"
            />
            <Select
              label="Responsibility"
              value={params.scope}
              onChange={(event) => setParams({ scope: event.target.value })}
              options={[{ value: 'responsible', label: 'Calls I am responsible for' }]}
              placeholder="All visible calls"
            />
          </>
        )}
        <Input
          label="Call number"
          value={codeInput}
          placeholder="e.g. SC-1042"
          onChange={(event) => {
            setCodeInput(event.target.value)
            setParams({ code: event.target.value.trim() })
          }}
        />
      </div>
      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<Wrench size={24} />}
            title={filtered ? 'No service calls match' : isEmployee ? 'No service calls assigned to you' : 'No service calls yet'}
            description={filtered ? 'Try different filters.' : isEmployee ? 'Calls assigned to you will appear here.' : 'Calls you are responsible for or your team is assigned to will appear here.'}
          />
        }
      >
        {(data) => (
          <>
            <RecordList
              rows={data.items}
              columns={columns}
              rowKey={(c) => c.id}
              rowHref={(c) => `/service/${c.id}`}
              caption="Service calls"
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
          </>
        )}
      </QueryBoundary>
    </section>
  )
}
