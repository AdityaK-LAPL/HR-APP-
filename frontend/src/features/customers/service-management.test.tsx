import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, manager, mockSession, owner } from '@/test/api'
import { call, list, person, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const customer = (over = {}) => ({ id: 'cust-1', customer_code: 'CU-7', name: 'Acme Forgings', address: 'Plot 9, Peenya', notes: null, is_active: true, created_at: '', updated_at: '', ...over })
const machine = (over = {}) => ({ id: 'mach-1', machine_code: 'MC-88', customer_id: 'cust-1', model_name: 'VMC-850', serial_number: 'SN-5521', installation_date: null, purchase_info: null, warranty_info: 'Until Dec 2026', location: 'Bay 4', status: 'active', is_active: true, created_at: '', updated_at: '', ...over })
const contact = (over = {}) => ({ id: 'ct-1', customer_id: 'cust-1', name: 'Priya Nair', designation: 'Plant head', phone: '+91 98450 00000', email: 'priya@acme.example', is_primary: true, ...over })

function setup(who = manager, extra: Parameters<typeof server.use> = []) {
  mockSession(who)
  server.use(
    ...extra, // overrides first: MSW uses the first handler that matches
    http.get(`${BASE}/customers`, () => HttpResponse.json(list([customer(), customer({ id: 'cust-2', customer_code: 'CU-9', name: 'Old Works', is_active: false })]))),
    http.get(`${BASE}/customers/cust-1`, () => HttpResponse.json(customer())),
    http.get(`${BASE}/customers/cust-1/contacts`, () => HttpResponse.json([contact()])),
    http.get(`${BASE}/machines`, () => HttpResponse.json(list([machine()]))),
    http.get(`${BASE}/machines/mach-1`, () => HttpResponse.json(machine())),
    http.get(`${BASE}/users/${manager.id}/subordinates`, () => HttpResponse.json([person({ id: 'm-sub', name: 'Sub Manager', role: 'manager' }), person()])),
    http.get(`${BASE}/users`, () => HttpResponse.json(list([person({ id: manager.id, name: manager.name, role: 'manager' })]))),
    http.get(`${BASE}/service-calls`, () => HttpResponse.json(list([call()]))),
  )
}

describe('Customers', () => {
  it('managers and the owner can add a customer; employees cannot', async () => {
    setup(employee)
    renderApp('/customers')
    expect(await screen.findByRole('heading', { level: 1, name: 'My customers' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a customer' })).not.toBeInTheDocument()
  })

  it('validates and creates a customer, then opens it', async () => {
    const seen = spy()
    setup(manager, [http.post(`${BASE}/customers`, async ({ request }) => { await seen.record(request); return HttpResponse.json(customer({ id: 'cust-9', name: 'New Co', customer_code: 'CU-99' }), { status: 201 }) }), http.get(`${BASE}/customers/cust-9`, () => HttpResponse.json(customer({ id: 'cust-9', name: 'New Co', customer_code: 'CU-99' })))])
    renderApp('/customers')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add a customer' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add a customer' }))
    await user.click(dialog.getByRole('button', { name: 'Add customer' }))
    expect(await dialog.findByText('Enter a customer code.')).toBeInTheDocument()
    expect(dialog.getByText("Enter the customer's name.")).toBeInTheDocument()
    await user.type(dialog.getByLabelText(/customer code/i), ' CU-99 ')
    await user.type(dialog.getByLabelText(/^name/i), 'New Co')
    await user.type(dialog.getByLabelText('Address'), 'Bangalore')
    await user.click(dialog.getByRole('button', { name: 'Add customer' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ customer_code: 'CU-99', name: 'New Co', address: 'Bangalore', notes: null }))
    expect(await screen.findByRole('heading', { level: 1, name: 'New Co' })).toBeInTheDocument()
  })

  it('shows the server\'s reason when the code is taken', async () => {
    setup(manager, [http.post(`${BASE}/customers`, () => apiError(409, 'conflict', 'customer_code is already in use.'))])
    renderApp('/customers')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add a customer' }))
    const dialog = within(await screen.findByRole('dialog'))
    await user.type(dialog.getByLabelText(/customer code/i), 'CU-7')
    await user.type(dialog.getByLabelText(/^name/i), 'Dup')
    await user.click(dialog.getByRole('button', { name: 'Add customer' }))
    expect(await dialog.findByText('customer_code is already in use.')).toBeInTheDocument()
  })

  it('searches by name, code, contact and machine serial number through the API, and marks inactive customers', async () => {
    const seen = spy()
    setup(manager, [http.get(`${BASE}/customers`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([customer({ is_active: false })])) })])
    renderApp('/customers')
    const user = userEvent.setup()
    expect(await screen.findByText('Inactive')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Customer name'), 'Acme')
    await user.type(screen.getByLabelText('Customer code'), 'CU-7')
    await user.type(screen.getByLabelText(/^Contact/), 'priya')
    await user.type(screen.getByLabelText('Machine serial number'), 'SN-55')
    await waitFor(() => {
      const q = seen.seen.at(-1)?.url.searchParams
      expect(q?.get('name')).toBe('Acme')
      expect(q?.get('customer_code')).toBe('CU-7')
      expect(q?.get('contact')).toBe('priya')
      expect(q?.get('machine_serial')).toBe('SN-55')
    })
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument())
  })
})

describe('Customer page', () => {
  it('edits only what changed', async () => {
    const seen = spy()
    setup(manager, [http.patch(`${BASE}/customers/cust-1`, async ({ request }) => { await seen.record(request); return HttpResponse.json(customer({ name: 'Acme Forgings Ltd' })) })])
    renderApp('/customers/cust-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit customer' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit customer' }))
    expect(dialog.getByLabelText(/customer code/i)).toBeDisabled()
    const name = dialog.getByLabelText(/^name/i)
    await user.clear(name)
    await user.type(name, 'Acme Forgings Ltd')
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ name: 'Acme Forgings Ltd' }))
  })

  it('shows the server\'s refusal when a manager may not edit this customer', async () => {
    setup(manager, [http.patch(`${BASE}/customers/cust-1`, () => apiError(403, 'forbidden', 'You do not have permission to edit this customer.'))])
    renderApp('/customers/cust-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit customer' }))
    const dialog = within(await screen.findByRole('dialog'))
    await user.type(dialog.getByLabelText('Address'), ' extra')
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))
    expect(await dialog.findByText('You do not have permission to edit this customer.')).toBeInTheDocument()
  })

  it('employees get a read-only customer page with a Maps link', async () => {
    setup(employee)
    renderApp('/customers/cust-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Forgings' })).toBeInTheDocument()
    for (const name of ['Edit customer', 'Add contact', 'Add machine', 'Log a service call', 'Deactivate']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    const maps = screen.getByRole('link', { name: /Open in Maps/ })
    expect(maps).toHaveAttribute('href', expect.stringContaining('google.com/maps/search/?api=1&query=Plot%209%2C%20Peenya'))
    expect(maps).toHaveAttribute('target', '_blank')
    expect(maps).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('a manager is not offered Deactivate (the owner decides that)', async () => {
    setup(manager)
    renderApp('/customers/cust-1')
    await screen.findByRole('button', { name: 'Edit customer' })
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument()
  })

  it('the owner deactivates with a confirmation', async () => {
    const seen = spy()
    setup(owner, [http.patch(`${BASE}/customers/cust-1`, async ({ request }) => { await seen.record(request); return HttpResponse.json(customer({ is_active: false })) })])
    renderApp('/customers/cust-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Deactivate Acme Forgings?' }))
    expect(dialog.getByText(/service history and files are kept/)).toBeInTheDocument()
    expect(seen.seen).toHaveLength(0)
    await user.click(dialog.getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ is_active: false }))
  })

  it('adds a contact (validating the email) and edits one', async () => {
    const add = spy()
    const edit = spy()
    setup(manager, [
      http.post(`${BASE}/customers/cust-1/contacts`, async ({ request }) => { await add.record(request); return HttpResponse.json(contact({ id: 'ct-2' }), { status: 201 }) }),
      http.patch(`${BASE}/customers/cust-1/contacts/ct-1`, async ({ request }) => { await edit.record(request); return HttpResponse.json(contact({ phone: '+91 99999 11111' })) }),
    ])
    renderApp('/customers/cust-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add contact' }))
    let dialog = within(await screen.findByRole('dialog', { name: 'Add a contact' }))
    await user.type(dialog.getByLabelText(/^name/i), 'Ravi Kumar')
    await user.type(dialog.getByLabelText('Email'), 'not-an-email')
    await user.click(dialog.getByRole('button', { name: 'Add contact' }))
    expect(await dialog.findByText('Enter a valid email address.')).toBeInTheDocument()
    await user.clear(dialog.getByLabelText('Email'))
    await user.type(dialog.getByLabelText('Email'), 'ravi@acme.example')
    await user.click(dialog.getByLabelText('Primary contact'))
    await user.click(dialog.getByRole('button', { name: 'Add contact' }))
    await waitFor(() => expect(add.seen[0]?.body).toEqual({ name: 'Ravi Kumar', designation: null, phone: null, email: 'ravi@acme.example', is_primary: true }))

    await user.click(await screen.findByRole('button', { name: 'Edit contact Priya Nair' }))
    dialog = within(await screen.findByRole('dialog', { name: 'Edit contact' }))
    await user.clear(dialog.getByLabelText('Phone'))
    await user.type(dialog.getByLabelText('Phone'), '+91 99999 11111')
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(edit.seen[0]?.body).toEqual({ phone: '+91 99999 11111' }))
  })

  it('adds a machine for this customer', async () => {
    const seen = spy()
    setup(manager, [http.post(`${BASE}/machines`, async ({ request }) => { await seen.record(request); return HttpResponse.json(machine({ id: 'mach-2', machine_code: 'MC-99' }), { status: 201 }) })])
    renderApp('/customers/cust-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add machine' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add a machine' }))
    expect(dialog.getByText('Acme Forgings')).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Add machine' }))
    expect(await dialog.findByText('Enter a machine code.')).toBeInTheDocument()
    await user.type(dialog.getByLabelText(/machine code/i), 'MC-99')
    await user.type(dialog.getByLabelText('Model'), 'VMC-1000')
    await user.type(dialog.getByLabelText('Installed on'), '2026-02-01')
    await user.click(dialog.getByRole('button', { name: 'Add machine' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ customer_id: 'cust-1', machine_code: 'MC-99', model_name: 'VMC-1000', serial_number: null, installation_date: '2026-02-01', location: null, purchase_info: null, warranty_info: null }))
  })
})

describe('Machines', () => {
  it('adds a machine by finding its customer first', async () => {
    const seen = spy()
    setup(manager, [http.post(`${BASE}/machines`, async ({ request }) => { await seen.record(request); return HttpResponse.json(machine({ id: 'mach-2' }), { status: 201 }) })])
    renderApp('/machines')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add a machine' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add a machine' }))
    await user.type(dialog.getByLabelText(/machine code/i), 'MC-1')
    await user.click(dialog.getByRole('button', { name: 'Add machine' }))
    expect(await dialog.findByText('Choose the customer this machine belongs to.')).toBeInTheDocument()
    await user.type(dialog.getByLabelText('Find customer'), 'Acme')
    await dialog.findByRole('option', { name: /Acme Forgings · CU-7/ })
    await user.selectOptions(dialog.getByLabelText(/^customer/i), 'cust-1')
    await user.click(dialog.getByRole('button', { name: 'Add machine' }))
    await waitFor(() => expect(seen.seen[0]?.body).toMatchObject({ customer_id: 'cust-1', machine_code: 'MC-1' }))
  })

  it('edits status and details, sending only what changed; the code is fixed', async () => {
    const seen = spy()
    setup(manager, [http.patch(`${BASE}/machines/mach-1`, async ({ request }) => { await seen.record(request); return HttpResponse.json(machine({ status: 'inactive' })) })])
    renderApp('/machines/mach-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit machine' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit machine' }))
    expect(dialog.getByLabelText(/machine code/i)).toBeDisabled()
    await user.selectOptions(dialog.getByLabelText('Status'), 'inactive')
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ status: 'inactive' }))
  })

  it('filters by model and by customer (with a way back to all customers)', async () => {
    const seen = spy()
    setup(manager, [http.get(`${BASE}/machines`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([machine({ is_active: false })])) })])
    renderApp('/machines?customer=cust-1')
    expect(await screen.findByRole('link', { name: 'Acme Forgings' })).toHaveAttribute('href', '/customers/cust-1')
    expect(await screen.findByText('Deactivated')).toBeInTheDocument()
    await userEvent.setup().type(screen.getByLabelText('Model'), 'VMC')
    await waitFor(() => {
      const q = seen.seen.at(-1)?.url.searchParams
      expect(q?.get('customer_id')).toBe('cust-1')
      expect(q?.get('model_name')).toBe('VMC')
    })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show machines of all customers' }))
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('customer_id')).toBeNull())
  })

  it('employees cannot add or edit machines', async () => {
    setup(employee)
    renderApp('/machines/mach-1')
    expect(await screen.findByRole('heading', { level: 1, name: /MC-88/ })).toBeInTheDocument()
    for (const name of ['Edit machine', 'Log a service call', 'Deactivate']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })

  it('only the owner deactivates, after confirmation', async () => {
    const seen = spy()
    setup(owner, [http.patch(`${BASE}/machines/mach-1`, async ({ request }) => { await seen.record(request); return HttpResponse.json(machine({ is_active: false })) })])
    renderApp('/machines/mach-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Deactivate MC-88?' })).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ is_active: false }))
  })
})
