import { Building2, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/features/auth/authContext'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { useCustomers, type Customer } from '@/features/service/queries'
import { CustomerFormDialog } from './CustomerFormDialog'

const PAGE_SIZE = 20

/** The customer directory. Employees see only customers reachable through their assignments (the API scopes the list). */
export function CustomersPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isEmployee = user?.role === 'employee'
  const [params, setParams] = useUrlParams({ name: '', code: '', contact: '', serial: '', page: '1' })
  const [nameInput, setNameInput] = useState(params.name)
  const [codeInput, setCodeInput] = useState(params.code)
  const [contactInput, setContactInput] = useState(params.contact)
  const [serialInput, setSerialInput] = useState(params.serial)
  const [adding, setAdding] = useState(false)
  const name = useDebouncedValue(nameInput.trim())
  const code = useDebouncedValue(codeInput.trim())
  const contact = useDebouncedValue(contactInput.trim())
  const serial = useDebouncedValue(serialInput.trim())
  const page = pageNumber(params.page)
  const filtered = Boolean(name || code || contact || serial)
  const query = useCustomers({
    ...(name ? { name } : {}),
    ...(code ? { customer_code: code } : {}),
    ...(contact ? { contact } : {}),
    ...(serial ? { machine_serial: serial } : {}),
    page,
    page_size: PAGE_SIZE,
  })

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      primary: true,
      cell: (c) => (
        <>
          {c.name}
          {!c.is_active && (
            <>
              {' '}
              <span className="badge badge-neutral">Inactive</span>
            </>
          )}
        </>
      ),
    },
    { key: 'code', header: 'Code', cell: (c) => c.customer_code },
    { key: 'address', header: 'Address', hideOnPhone: true, cell: (c) => <span className="clamp-2">{c.address ?? '—'}</span> },
  ]

  const field = (label: string, value: string, set: (v: string) => void, key: 'name' | 'code' | 'contact' | 'serial', placeholder?: string) => (
    <Input
      label={label}
      value={value}
      {...(placeholder ? { placeholder } : {})}
      onChange={(event) => {
        set(event.target.value)
        setParams({ [key]: event.target.value.trim() })
      }}
    />
  )

  return (
    <section>
      <PageHeader
        title={isEmployee ? 'My customers' : 'Customers'}
        description={isEmployee ? 'Customers you are working with through your service calls.' : 'The customer directory. Open a customer for contacts, machines and service history.'}
        actions={
          !isEmployee ? (
            <Button icon={<Plus size={18} />} onClick={() => setAdding(true)}>
              Add a customer
            </Button>
          ) : undefined
        }
      />
      <div className="toolbar">
        {field('Customer name', nameInput, setNameInput, 'name')}
        {field('Customer code', codeInput, setCodeInput, 'code')}
        {field('Contact (name, phone or email)', contactInput, setContactInput, 'contact')}
        {field('Machine serial number', serialInput, setSerialInput, 'serial')}
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setNameInput('')
              setCodeInput('')
              setContactInput('')
              setSerialInput('')
              setParams({ name: '', code: '', contact: '', serial: '' })
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
            icon={<Building2 size={24} />}
            title={filtered ? 'No customers match' : 'No customers yet'}
            description={filtered ? 'Try different or fewer filters.' : isEmployee ? 'Customers appear here once you are assigned to one of their service calls.' : 'Add the first customer to start logging service calls.'}
            action={!filtered && !isEmployee ? <Button icon={<Plus size={18} />} onClick={() => setAdding(true)}>Add a customer</Button> : undefined}
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
      {!isEmployee && adding && <CustomerFormDialog open onClose={() => setAdding(false)} onSaved={(saved) => void navigate(`/customers/${saved.id}`)} />}
    </section>
  )
}
