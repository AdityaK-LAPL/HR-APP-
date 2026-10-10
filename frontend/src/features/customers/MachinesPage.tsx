import { Cpu, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/features/auth/authContext'
import { MACHINE_STATUS } from '@/lib/labels'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { useCustomer, useCustomerNames, useMachines, type Machine } from '@/features/service/queries'
import { MachineFormDialog } from './MachineFormDialog'

const PAGE_SIZE = 20

/** Customer machines. Employees see only machines reached through their assignments (the API scopes the list). */
export function MachinesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isEmployee = user?.role === 'employee'
  const [params, setParams] = useUrlParams({ q: '', model: '', customer: '', page: '1' })
  const [input, setInput] = useState(params.q)
  const [modelInput, setModelInput] = useState(params.model)
  const [adding, setAdding] = useState(false)
  const search = useDebouncedValue(input.trim())
  const model = useDebouncedValue(modelInput.trim())
  const page = pageNumber(params.page)
  const filtered = Boolean(search || model || params.customer)
  const query = useMachines({
    ...(search ? { serial_number: search } : {}),
    ...(model ? { model_name: model } : {}),
    ...(params.customer ? { customer_id: params.customer } : {}),
    page,
    page_size: PAGE_SIZE,
  })
  const customerName = useCustomerNames((query.data?.items ?? []).map((machine) => machine.customer_id))
  const scopedCustomer = useCustomer(params.customer || undefined)

  const columns: Column<Machine>[] = [
    {
      key: 'code',
      header: 'Machine',
      primary: true,
      cell: (m) => (
        <>
          {m.machine_code}
          {!m.is_active && (
            <>
              {' '}
              <span className="badge badge-neutral">Deactivated</span>
            </>
          )}
        </>
      ),
    },
    { key: 'model', header: 'Model', cell: (m) => m.model_name ?? '—' },
    { key: 'serial', header: 'Serial no.', cell: (m) => m.serial_number ?? '—' },
    { key: 'customer', header: 'Customer', cell: (m) => customerName(m.customer_id) },
    { key: 'status', header: 'Status', cell: (m) => <StatusBadge table={MACHINE_STATUS} value={m.status} /> },
    { key: 'where', header: 'Location', hideOnPhone: true, cell: (m) => m.location ?? '—' },
  ]

  return (
    <section>
      <PageHeader
        title={isEmployee ? 'My machines' : 'Machines'}
        description={isEmployee ? 'Machines you are working on through your service calls.' : 'Customer machines. Open one for its details and service history.'}
        actions={
          !isEmployee ? (
            <Button icon={<Plus size={18} />} onClick={() => setAdding(true)}>
              Add a machine
            </Button>
          ) : undefined
        }
      />
      <div className="toolbar">
        <Input
          label="Serial number"
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            setParams({ q: event.target.value.trim() })
          }}
        />
        <Input
          label="Model"
          value={modelInput}
          onChange={(event) => {
            setModelInput(event.target.value)
            setParams({ model: event.target.value.trim() })
          }}
        />
        {params.customer && (
          <div className="field">
            <span className="field-label">Customer</span>
            <span className="meta-line">
              <Link to={`/customers/${params.customer}`}>{scopedCustomer.data?.name ?? 'Customer'}</Link>
              <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setParams({ customer: '' })} aria-label="Show machines of all customers">
                All customers
              </Button>
            </span>
          </div>
        )}
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setInput('')
              setModelInput('')
              setParams({ q: '', model: '', customer: '' })
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<Cpu size={24} />}
            title={filtered ? 'No machines match' : 'No machines yet'}
            description={filtered ? 'Try different or fewer filters.' : isEmployee ? 'Machines appear here once you are assigned to a service call on them.' : 'Add a machine to one of your customers.'}
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
      {!isEmployee && adding && (
        <MachineFormDialog
          open
          onClose={() => setAdding(false)}
          {...(scopedCustomer.data ? { customer: { id: scopedCustomer.data.id, name: scopedCustomer.data.name } } : {})}
          onSaved={(saved) => void navigate(`/machines/${saved.id}`)}
        />
      )}
    </section>
  )
}
