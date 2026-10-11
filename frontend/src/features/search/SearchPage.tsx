import { Building2, Cpu, Search as SearchIcon, Users, Wrench } from 'lucide-react'
import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/features/auth/authContext'
import { labelOfRole } from '@/features/profile/roles'
import { SERVICE_STATUS } from '@/lib/labels'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { useUrlParams } from '@/lib/useUrlParams'
import { useState } from 'react'

const LIMIT = 6
const MIN_LENGTH = 2

type Customer = Schema<'CustomerResponse'>
type Machine = Schema<'MachineResponse'>
type Call = Schema<'ServiceCallResponse'>
type Person = Schema<'UserResponse'>

const unique = <T extends { id: string }>(lists: readonly (readonly T[] | undefined)[]): T[] => {
  const seen = new Map<string, T>()
  for (const list of lists) for (const item of list ?? []) if (!seen.has(item.id)) seen.set(item.id, item)
  return [...seen.values()]
}

/**
 * One box over the places the API can search: people, customers (name, code, contact, machine
 * serial), machines (serial, model) and service calls (call number). There is no company-wide search
 * endpoint, so this runs the same scoped list queries the individual screens use - what you cannot
 * see there, you cannot find here. Tasks, projects and EOD reports have no text search in the API.
 */
export function SearchPage() {
  const { user } = useAuth()
  const [params, setParams] = useUrlParams({ q: '' })
  const [input, setInput] = useState(params.q)
  const term = useDebouncedValue(input.trim())
  const ready = term.length >= MIN_LENGTH
  const canSeePeople = user?.role !== 'employee'

  const list = <T,>(path: string, field: string, enabled = true) => ({
    queryKey: ['search', path, field, term],
    queryFn: ({ signal }: { signal: AbortSignal }) => api.get<{ items: T[]; total: number }>(path, { query: { [field]: term, page: 1, page_size: LIMIT }, signal }),
    enabled: ready && enabled,
    staleTime: 30_000,
  })
  const [people, byName, byCode, byContact, bySerialOwner, bySerial, byModel, calls] = useQueries({
    queries: [
      list<Person>('/users', 'search', canSeePeople),
      list<Customer>('/customers', 'name'),
      list<Customer>('/customers', 'customer_code'),
      list<Customer>('/customers', 'contact'),
      list<Customer>('/customers', 'machine_serial'),
      list<Machine>('/machines', 'serial_number'),
      list<Machine>('/machines', 'model_name'),
      list<Call>('/service-calls', 'service_call_code'),
    ],
  })
  const customers = unique<Customer>([byName?.data?.items, byCode?.data?.items, byContact?.data?.items, bySerialOwner?.data?.items]).slice(0, LIMIT)
  const machines = unique<Machine>([bySerial?.data?.items, byModel?.data?.items]).slice(0, LIMIT)
  const pending = [people, byName, byCode, byContact, bySerialOwner, bySerial, byModel, calls].some((q) => q?.isFetching && ready)
  const people_ = canSeePeople ? (people?.data?.items ?? []) : []
  const callItems = calls?.data?.items ?? []
  const nothing = ready && !pending && people_.length + customers.length + machines.length + callItems.length === 0

  return (
    <section>
      <PageHeader title="Search" description={canSeePeople ? 'Find people, customers, machines and service calls.' : 'Find your customers, machines and service calls.'} />
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          setParams({ q: input.trim() })
        }}
      >
        <Input
          label="Search"
          type="search"
          autoFocus
          placeholder={canSeePeople ? 'A name, an employee ID, a customer, a serial number, a call number…' : 'A customer, a serial number, a call number…'}
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            setParams({ q: event.target.value.trim() })
          }}
          icon={<SearchIcon size={16} />}
          hint={`Type at least ${MIN_LENGTH} characters. Matches can be partial, in any case.`}
        />
      </form>

      {!ready ? (
        <EmptyState icon={<SearchIcon size={24} />} title="What are you looking for?" description="Results appear as you type." />
      ) : pending && people_.length + customers.length + machines.length + callItems.length === 0 ? (
        <Skeleton height={60} />
      ) : nothing ? (
        <EmptyState icon={<SearchIcon size={24} />} title={`Nothing found for “${term}”`} description="Check the spelling, or try part of a name, code or serial number." />
      ) : (
        <div aria-live="polite">
          {canSeePeople && people_.length > 0 && (
            <Section title="People" action={<Link to={`/users?q=${encodeURIComponent(term)}`}>All people</Link>}>
              <ul style={{ listStyle: 'none' }} className="stack">
                {people_.map((person) => (
                  <li key={person.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                    <span>
                      <Users size={14} aria-hidden="true" /> <Link className="inline-link" to={`/users/${person.id}`}>{person.name}</Link> · {person.employee_code}
                      {person.designation ? ` · ${person.designation}` : ''}
                    </span>
                    <span>
                      {labelOfRole(person.role)}
                      {!person.is_active ? ' · inactive' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {customers.length > 0 && (
            <Section title="Customers" action={<Link to={`/customers?name=${encodeURIComponent(term)}`}>All customers</Link>}>
              <ul style={{ listStyle: 'none' }} className="stack">
                {customers.map((customer) => (
                  <li key={customer.id}>
                    <Building2 size={14} aria-hidden="true" /> <Link className="inline-link" to={`/customers/${customer.id}`}>{customer.name}</Link> · {customer.customer_code}
                    {!customer.is_active ? ' · inactive' : ''}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {machines.length > 0 && (
            <Section title="Machines" action={<Link to={`/machines?q=${encodeURIComponent(term)}`}>All machines</Link>}>
              <ul style={{ listStyle: 'none' }} className="stack">
                {machines.map((machine) => (
                  <li key={machine.id}>
                    <Cpu size={14} aria-hidden="true" /> <Link className="inline-link" to={`/machines/${machine.id}`}>{machine.machine_code}</Link>
                    {machine.model_name ? ` · ${machine.model_name}` : ''}
                    {machine.serial_number ? ` · ${machine.serial_number}` : ''}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {callItems.length > 0 && (
            <Section title="Service calls" action={<Link to={`/service?code=${encodeURIComponent(term)}`}>All service calls</Link>}>
              <ul style={{ listStyle: 'none' }} className="stack">
                {callItems.map((call) => (
                  <li key={call.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                    <span>
                      <Wrench size={14} aria-hidden="true" /> <Link className="inline-link" to={`/service/${call.id}`}>{call.service_call_code}</Link> · <span className="clamp-2">{call.issue_reported}</span>
                    </span>
                    <StatusBadge table={SERVICE_STATUS} value={call.status} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </section>
  )
}
