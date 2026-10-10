import { Plus, Wrench, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { StatTile } from '@/components/data/StatTile'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/features/auth/authContext'
import { usePeople } from '@/features/people/usePeople'
import { countOf, useServiceSummary, useVisiblePeopleOptions } from '@/features/team/queries'
import { formatDateTime, formatDuration } from '@/lib/dates'
import { ACTIVE_CALL_STATUSES, PRIORITY, SERVICE_STATUS, SERVICE_TYPE, labelOf, optionsOf } from '@/lib/labels'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { ServiceCallFormDialog } from './ServiceCallFormDialog'
import { useCustomer, useCustomerNames, useMachine, useServiceCalls, type ServiceCall } from './queries'

const PAGE_SIZE = 20

export function ServiceListPage() {
  const { user } = useAuth()
  const isEmployee = user?.role === 'employee'
  const [params, setParams] = useUrlParams({ status: '', code: '', employee: '', scope: '', customer: '', machine: '', page: '1' })
  const people = useVisiblePeopleOptions()
  const [logging, setLogging] = useState(false)
  const summary = useServiceSummary(undefined, !isEmployee)
  const scopedCustomer = useCustomer(params.customer || undefined)
  const scopedMachine = useMachine(params.machine || undefined)
  const [codeInput, setCodeInput] = useState(params.code)
  const code = useDebouncedValue(codeInput.trim())
  const page = pageNumber(params.page)
  const query = useServiceCalls({
    ...(params.status ? { status: params.status } : {}),
    ...(code ? { service_call_code: code } : {}),
    ...(!isEmployee && params.employee ? { employee_id: params.employee } : {}),
    ...(!isEmployee && params.scope === 'responsible' && user ? { manager_id: user.id } : {}),
    ...(params.customer ? { customer_id: params.customer } : {}),
    ...(params.machine ? { machine_id: params.machine } : {}),
    page,
    page_size: PAGE_SIZE,
  })
  const customerName = useCustomerNames((query.data?.items ?? []).map((call) => call.customer_id))
  const { nameOf } = usePeople((query.data?.items ?? []).map((call) => call.responsible_manager_id))
  const filtered = Boolean(params.status || code || params.employee || params.scope || params.customer || params.machine)

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
        actions={
          !isEmployee ? (
            <Button icon={<Plus size={18} />} onClick={() => setLogging(true)}>
              Log a service call
            </Button>
          ) : undefined
        }
      />
      {!isEmployee && (
        <div className="stat-grid">
          <StatTile to="/service" value={countOf(summary.data?.by_status, ...ACTIVE_CALL_STATUSES)} label="Active calls" />
          <StatTile to="/service?status=new" value={countOf(summary.data?.by_status, 'new')} label="New, not yet assigned" />
          <StatTile to="/service?status=resolved" value={countOf(summary.data?.by_status, 'resolved', 'closed')} label="Resolved or closed" />
          <StatTile
            to="/service"
            value={summary.data ? (summary.data.average_resolution_minutes === null ? '—' : formatDuration(Math.round(summary.data.average_resolution_minutes)) || '0m') : undefined}
            label="Average time to resolve"
          />
        </div>
      )}
      <div className="toolbar">
        <Select
          label="Status"
          value={params.status}
          onChange={(event) => setParams({ status: event.target.value })}
          options={optionsOf(SERVICE_STATUS)}
          placeholder="All statuses"
        />
        {(params.customer || params.machine) && (
          <div className="field">
            <span className="field-label">Showing calls for</span>
            <span className="meta-line">
              {params.customer && <Link to={`/customers/${params.customer}`}>{scopedCustomer.data?.name ?? 'Customer'}</Link>}
              {params.machine && <Link to={`/machines/${params.machine}`}>{scopedMachine.data?.machine_code ?? 'Machine'}</Link>}
              <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setParams({ customer: '', machine: '' })} aria-label="Show calls for all customers and machines">
                All calls
              </Button>
            </span>
          </div>
        )}
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
      {!isEmployee && logging && (
        <ServiceCallFormDialog
          open
          onClose={() => setLogging(false)}
          {...(scopedCustomer.data ? { customer: { id: scopedCustomer.data.id, name: scopedCustomer.data.name } } : {})}
          {...(scopedMachine.data ? { machine: { id: scopedMachine.data.id, machine_code: scopedMachine.data.machine_code } } : {})}
        />
      )}
    </section>
  )
}
