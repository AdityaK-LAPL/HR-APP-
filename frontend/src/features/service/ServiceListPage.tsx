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
import { formatDateTime } from '@/lib/dates'
import { PRIORITY, SERVICE_STATUS, SERVICE_TYPE, labelOf, optionsOf } from '@/lib/labels'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { useCustomerNames, useServiceCalls, type ServiceCall } from './queries'

const PAGE_SIZE = 20

export function ServiceListPage() {
  const [params, setParams] = useUrlParams({ status: '', code: '', page: '1' })
  const [codeInput, setCodeInput] = useState(params.code)
  const code = useDebouncedValue(codeInput.trim())
  const page = pageNumber(params.page)
  const query = useServiceCalls({
    ...(params.status ? { status: params.status } : {}),
    ...(code ? { service_call_code: code } : {}),
    page,
    page_size: PAGE_SIZE,
  })
  const customerName = useCustomerNames((query.data?.items ?? []).map((call) => call.customer_id))
  const filtered = Boolean(params.status || code)

  const columns: Column<ServiceCall>[] = [
    { key: 'code', header: 'Call', primary: true, cell: (c) => c.service_call_code },
    { key: 'customer', header: 'Customer', cell: (c) => customerName(c.customer_id) },
    { key: 'status', header: 'Status', cell: (c) => <StatusBadge table={SERVICE_STATUS} value={c.status} /> },
    { key: 'priority', header: 'Priority', cell: (c) => <StatusBadge table={PRIORITY} value={c.priority} /> },
    { key: 'type', header: 'Type', hideOnPhone: true, cell: (c) => labelOf(SERVICE_TYPE, c.service_type) },
    { key: 'issue', header: 'Issue', hideOnPhone: true, cell: (c) => <span className="clamp-2">{c.issue_reported}</span> },
    { key: 'contacted', header: 'Reported', cell: (c) => formatDateTime(c.contacted_at) },
  ]

  return (
    <section>
      <PageHeader title="My service calls" description="Customer calls you are assigned to." />
      <div className="toolbar">
        <Select
          label="Status"
          value={params.status}
          onChange={(event) => setParams({ status: event.target.value })}
          options={optionsOf(SERVICE_STATUS)}
          placeholder="All statuses"
        />
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
            title={filtered ? 'No service calls match' : 'No service calls assigned to you'}
            description={filtered ? 'Try a different status or call number.' : 'Calls assigned to you will appear here.'}
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
