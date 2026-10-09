import { Cpu } from 'lucide-react'
import { useState } from 'react'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { MACHINE_STATUS } from '@/lib/labels'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { useCustomerNames, useMachines, type Machine } from '@/features/service/queries'

const PAGE_SIZE = 20

/** Machines reachable through the employee's service-call assignments (the API scopes the list). */
export function MachinesPage() {
  const [params, setParams] = useUrlParams({ q: '', page: '1' })
  const [input, setInput] = useState(params.q)
  const search = useDebouncedValue(input.trim())
  const page = pageNumber(params.page)
  const query = useMachines({ ...(search ? { serial_number: search } : {}), page, page_size: PAGE_SIZE })
  const customerName = useCustomerNames((query.data?.items ?? []).map((machine) => machine.customer_id))

  const columns: Column<Machine>[] = [
    { key: 'code', header: 'Machine', primary: true, cell: (m) => m.machine_code },
    { key: 'model', header: 'Model', cell: (m) => m.model_name ?? '—' },
    { key: 'serial', header: 'Serial no.', cell: (m) => m.serial_number ?? '—' },
    { key: 'customer', header: 'Customer', cell: (m) => customerName(m.customer_id) },
    { key: 'status', header: 'Status', cell: (m) => <StatusBadge table={MACHINE_STATUS} value={m.status} /> },
    { key: 'where', header: 'Location', hideOnPhone: true, cell: (m) => m.location ?? '—' },
  ]

  return (
    <section>
      <PageHeader title="My machines" description="Machines you are working on through your service calls." />
      <div className="toolbar">
        <Input
          label="Serial number"
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            setParams({ q: event.target.value.trim() })
          }}
        />
      </div>
      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<Cpu size={24} />}
            title={search ? 'No machines match' : 'No machines yet'}
            description={search ? 'Try a different serial number.' : 'Machines appear here once you are assigned to a service call on them.'}
          />
        }
      >
        {(data) => (
          <>
            <RecordList rows={data.items} columns={columns} rowKey={(m) => m.id} rowHref={(m) => `/machines/${m.id}`} caption="Machines" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
          </>
        )}
      </QueryBoundary>
    </section>
  )
}
