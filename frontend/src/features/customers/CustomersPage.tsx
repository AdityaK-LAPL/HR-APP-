import { Building2 } from 'lucide-react'
import { useState } from 'react'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { useCustomers, type Customer } from '@/features/service/queries'

const PAGE_SIZE = 20

/** Customers reachable through the employee's service-call assignments (the API scopes the list). */
export function CustomersPage() {
  const [params, setParams] = useUrlParams({ name: '', page: '1' })
  const [nameInput, setNameInput] = useState(params.name)
  const name = useDebouncedValue(nameInput.trim())
  const page = pageNumber(params.page)
  const query = useCustomers({ ...(name ? { name } : {}), page, page_size: PAGE_SIZE })

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Customer', primary: true, cell: (c) => c.name },
    { key: 'code', header: 'Code', cell: (c) => c.customer_code },
    { key: 'address', header: 'Address', hideOnPhone: true, cell: (c) => <span className="clamp-2">{c.address ?? '—'}</span> },
  ]

  return (
    <section>
      <PageHeader title="My customers" description="Customers you are working with through your service calls." />
      <div className="toolbar">
        <Input
          label="Customer name"
          value={nameInput}
          onChange={(event) => {
            setNameInput(event.target.value)
            setParams({ name: event.target.value.trim() })
          }}
        />
      </div>
      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<Building2 size={24} />}
            title={name ? 'No customers match' : 'No customers yet'}
            description={name ? 'Try a different name.' : 'Customers appear here once you are assigned to one of their service calls.'}
          />
        }
      >
        {(data) => (
          <>
            <RecordList rows={data.items} columns={columns} rowKey={(c) => c.id} rowHref={(c) => `/customers/${c.id}`} caption="Customers" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
          </>
        )}
      </QueryBoundary>
    </section>
  )
}
