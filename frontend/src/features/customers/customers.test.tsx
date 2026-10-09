import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, mockSession } from '@/test/api'
import { call, list, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const customer = { id: 'cust-1', customer_code: 'CU-7', name: 'Acme Forgings', address: 'Plot 9, Peenya', notes: null, is_active: true, created_at: '', updated_at: '' }
const machine = { id: 'mach-1', machine_code: 'MC-88', customer_id: 'cust-1', model_name: 'VMC-850', serial_number: 'SN-5521', installation_date: null, purchase_info: null, warranty_info: 'Until Dec 2026', location: 'Bay 4', status: 'active', is_active: true, created_at: '', updated_at: '' }
const contacts = [{ id: 'ct-1', customer_id: 'cust-1', name: 'Priya Nair', designation: 'Plant head', phone: '+91 98450 00000', email: 'priya@acme.example', is_primary: true }]

function setup(extra: Parameters<typeof server.use> = []) {
  mockSession(employee)
  server.use(
    ...extra, // overrides first: MSW uses the first handler that matches
    http.get(`${BASE}/customers`, () => HttpResponse.json(list([customer]))),
    http.get(`${BASE}/customers/cust-1`, () => HttpResponse.json(customer)),
    http.get(`${BASE}/customers/cust-1/contacts`, () => HttpResponse.json(contacts)),
    http.get(`${BASE}/machines`, () => HttpResponse.json(list([machine]))),
    http.get(`${BASE}/machines/mach-1`, () => HttpResponse.json(machine)),
    http.get(`${BASE}/service-calls`, () => HttpResponse.json(list([call()]))),
  )
}

describe('My customers', () => {
  it('is in the employee navigation and lists customers', async () => {
    setup()
    renderApp('/customers')
    expect(await screen.findByRole('link', { name: 'Acme Forgings' })).toHaveAttribute('href', '/customers/cust-1')
    expect(screen.getByRole('heading', { level: 1, name: 'My customers' })).toBeInTheDocument()
  })

  it('searches by name', async () => {
    setup()
    const seen = spy()
    server.use(http.get(`${BASE}/customers`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([])) }))
    renderApp('/customers')
    await userEvent.setup().type(await screen.findByLabelText('Customer name'), 'Acme')
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('name')).toBe('Acme'))
  })

  it('has an empty state', async () => {
    setup([http.get(`${BASE}/customers`, () => HttpResponse.json(list([])))])
    renderApp('/customers')
    expect(await screen.findByText('No customers yet')).toBeInTheDocument()
  })

  it('shows contacts, machines and only my service calls on the detail page', async () => {
    setup()
    const seen = spy()
    server.use(http.get(`${BASE}/service-calls`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([call()])) }))
    renderApp('/customers/cust-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Forgings' })).toBeInTheDocument()
    expect(await screen.findByText('Priya Nair')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+91 98450 00000' })).toHaveAttribute('href', 'tel:+91 98450 00000')
    expect(await screen.findByRole('link', { name: 'MC-88' })).toHaveAttribute('href', '/machines/mach-1')
    expect(await screen.findByRole('link', { name: 'SC-1042' })).toHaveAttribute('href', '/service/c-1')
    expect(seen.seen.at(-1)?.url.searchParams.get('customer_id')).toBe('cust-1')
  })

  it('shows the not-found state when the customer is out of scope', async () => {
    setup([http.get(`${BASE}/customers/cust-1`, () => apiError(404, 'not_found', 'Customer not found.'))])
    renderApp('/customers/cust-1')
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
  })
})

describe('My machines', () => {
  it('lists machines with their customer', async () => {
    setup()
    renderApp('/machines')
    const link = await screen.findByRole('link', { name: 'MC-88' })
    expect(link).toHaveAttribute('href', '/machines/mach-1')
    expect(await within(screen.getByRole('table')).findByText('Acme Forgings')).toBeInTheDocument()
  })

  it('searches by serial number', async () => {
    setup()
    const seen = spy()
    server.use(http.get(`${BASE}/machines`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([])) }))
    renderApp('/machines')
    await userEvent.setup().type(await screen.findByLabelText('Serial number'), 'SN-55')
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('serial_number')).toBe('SN-55'))
  })

  it('shows machine details, its customer and my calls for it', async () => {
    setup()
    const seen = spy()
    server.use(http.get(`${BASE}/service-calls`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([call()])) }))
    renderApp('/machines/mach-1')
    expect(await screen.findByRole('heading', { level: 1, name: /MC-88/ })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Acme Forgings' })).toHaveAttribute('href', '/customers/cust-1')
    expect(screen.getByText('SN-5521')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'SC-1042' })).toBeInTheDocument()
    expect(seen.seen.at(-1)?.url.searchParams.get('machine_id')).toBe('mach-1')
  })
})
