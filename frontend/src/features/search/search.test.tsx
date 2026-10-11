import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, employee, manager, mockSession } from '@/test/api'
import { call, list, person, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const customer = (over = {}) => ({ id: 'cust-1', customer_code: 'CU-7', name: 'Acme Forgings', address: null, notes: null, is_active: true, created_at: '', updated_at: '', ...over })
const machine = { id: 'mach-1', machine_code: 'MC-88', customer_id: 'cust-1', model_name: 'VMC-850', serial_number: 'SN-5521', installation_date: null, purchase_info: null, warranty_info: null, location: null, status: 'active', is_active: true, created_at: '', updated_at: '' }

function setup(who = manager, extra: Parameters<typeof server.use> = []) {
  mockSession(who)
  server.use(...extra)
}

describe('Search', () => {
  it('asks first, then searches every place the API can search and groups the answers', async () => {
    setup(manager, [
      http.get(`${BASE}/users`, () => HttpResponse.json(list([person({ name: 'Acme Anand', employee_code: 'EMP9' })]))),
      http.get(`${BASE}/customers`, () => HttpResponse.json(list([customer()]))),
      http.get(`${BASE}/machines`, () => HttpResponse.json(list([machine]))),
      http.get(`${BASE}/service-calls`, () => HttpResponse.json(list([call()]))),
    ])
    renderApp('/search')
    expect(await screen.findByText('What are you looking for?')).toBeInTheDocument()
    await userEvent.setup().type(screen.getByLabelText('Search'), 'acme')
    expect(await screen.findByRole('heading', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Acme Anand' })).toHaveAttribute('href', `/users/${employee.id}`)
    expect(await screen.findByRole('link', { name: 'Acme Forgings' })).toHaveAttribute('href', '/customers/cust-1')
    expect(screen.getAllByRole('link', { name: 'Acme Forgings' })).toHaveLength(1) // the same customer found by several fields appears once
    expect(await screen.findByRole('link', { name: 'MC-88' })).toHaveAttribute('href', '/machines/mach-1')
    expect(await screen.findByRole('link', { name: 'SC-1042' })).toHaveAttribute('href', '/service/c-1')
    expect(screen.getByRole('link', { name: 'All customers' })).toHaveAttribute('href', '/customers?name=acme')
  })

  it('sends the term to the right filter of each list', async () => {
    const customers = spy()
    const machines = spy()
    const callsSpy = spy()
    const users = spy()
    setup(manager, [
      http.get(`${BASE}/users`, async ({ request }) => { await users.record(request); return HttpResponse.json(list([])) }),
      http.get(`${BASE}/customers`, async ({ request }) => { await customers.record(request); return HttpResponse.json(list([])) }),
      http.get(`${BASE}/machines`, async ({ request }) => { await machines.record(request); return HttpResponse.json(list([])) }),
      http.get(`${BASE}/service-calls`, async ({ request }) => { await callsSpy.record(request); return HttpResponse.json(list([])) }),
    ])
    renderApp('/search?q=SN-55')
    await screen.findByText(/Nothing found/)
    const fields = (spyObj: ReturnType<typeof spy>) => spyObj.seen.flatMap((s) => [...s.url.searchParams.keys()]).filter((key) => !['page', 'page_size'].includes(key)).sort()
    expect(fields(users)).toEqual(['search'])
    expect(fields(customers)).toEqual(['contact', 'customer_code', 'machine_serial', 'name'])
    expect(fields(machines)).toEqual(['model_name', 'serial_number'])
    expect(fields(callsSpy)).toEqual(['service_call_code'])
    expect(customers.seen.every((s) => s.url.searchParams.get('name') === 'SN-55' || s.url.searchParams.get('contact') === 'SN-55' || s.url.searchParams.get('customer_code') === 'SN-55' || s.url.searchParams.get('machine_serial') === 'SN-55')).toBe(true)
  })

  it('waits for two characters before searching', async () => {
    const seen = spy()
    setup(manager, [http.get(`${BASE}/customers`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([])) })])
    renderApp('/search')
    await userEvent.setup().type(await screen.findByLabelText('Search'), 'a')
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(seen.seen).toHaveLength(0)
    expect(screen.getByText('What are you looking for?')).toBeInTheDocument()
  })

  it('does not search people for an employee (and says what it does search)', async () => {
    const users = spy()
    setup(employee, [
      http.get(`${BASE}/users`, async ({ request }) => { await users.record(request); return HttpResponse.json(list([])) }),
      http.get(`${BASE}/customers`, () => HttpResponse.json(list([customer()]))),
    ])
    renderApp('/search?q=acme')
    expect(await screen.findByRole('link', { name: 'Acme Forgings' })).toBeInTheDocument()
    expect(screen.getByText('Find your customers, machines and service calls.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'People' })).not.toBeInTheDocument()
    expect(users.seen).toHaveLength(0)
  })

  it('is reachable from the header on every page', async () => {
    setup(employee)
    renderApp('/dashboard')
    expect(await screen.findByRole('link', { name: 'Search everything' })).toHaveAttribute('href', '/search')
  })

  it('says so when nothing matches', async () => {
    setup(manager)
    renderApp('/search?q=zzzz')
    const result = await screen.findByText(/Nothing found for “zzzz”/)
    expect(within(result.closest('div')!).getByText(/Check the spelling/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'People' })).not.toBeInTheDocument())
  })
})
