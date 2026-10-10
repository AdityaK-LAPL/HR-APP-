import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, manager, mockSession, owner } from '@/test/api'
import { call, list, person, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const customer = { id: 'cust-1', customer_code: 'CU-7', name: 'Acme Forgings', address: 'Plot 9, Peenya', notes: null, is_active: true, created_at: '', updated_at: '' }
const machine = { id: 'mach-1', machine_code: 'MC-88', customer_id: 'cust-1', model_name: 'VMC-850', serial_number: 'SN-5521', installation_date: null, purchase_info: null, warranty_info: null, location: null, status: 'active', is_active: true, created_at: '', updated_at: '' }
const contact = { id: 'ct-1', customer_id: 'cust-1', name: 'Priya Nair', designation: 'Plant head', phone: '+91 98450 00000', email: null, is_primary: true }
const assignment = { id: 'as-1', service_call_id: 'c-1', employee_id: employee.id, assigned_by: manager.id, assigned_at: '2026-03-05T05:00:00Z', role_in_call: null, is_active: true, unassigned_at: null }
const visit = { id: 'v-1', service_call_id: 'c-1', employee_id: employee.id, visit_type: 'field_visit', visit_date: '2026-03-05', arrival_time: null, departure_time: null, latitude: null, longitude: null, work_performed: 'Checked', problem_found: null, parts_used: null, action_taken: null, result: null, customer_signoff: null, created_at: '2026-03-05T04:00:00Z' }
const report = (over = {}) => ({ id: 'r-1', service_call_id: 'c-1', service_visit_id: null, employee_id: employee.id, report_datetime: '2026-03-05T08:00:00Z', service_type: 'field_visit', work_performed: 'Done', problem_found: null, root_cause: null, action_taken: null, parts_used: null, result: 'Fixed', pending_work: null, recommendations: null, employee_comments: null, reviewed_by: null, reviewed_at: null, submitted_at: '2026-03-05T09:00:00Z', ...over })

function setup(who = manager, extra: Parameters<typeof server.use> = []) {
  mockSession(who)
  server.use(
    ...extra,
    http.get(`${BASE}/customers`, () => HttpResponse.json(list([customer]))),
    http.get(`${BASE}/customers/cust-1`, () => HttpResponse.json(customer)),
    http.get(`${BASE}/customers/cust-1/contacts`, () => HttpResponse.json([contact])),
    http.get(`${BASE}/machines`, () => HttpResponse.json(list([machine]))),
    http.get(`${BASE}/machines/mach-1`, () => HttpResponse.json(machine)),
    http.get(`${BASE}/users/${manager.id}/subordinates`, () => HttpResponse.json([person({ id: 'm-sub', name: 'Sub Manager', role: 'manager' }), person()])),
    http.get(`${BASE}/users`, ({ request }) => HttpResponse.json(list(new URL(request.url).searchParams.get('role') === 'manager' ? [person({ id: 'm-2', name: 'Priya Peer', role: 'manager' })] : [person({ id: manager.id, name: manager.name, role: 'manager' })]))),
    http.get(`${BASE}/service-calls`, () => HttpResponse.json(list([call()]))),
    http.get(`${BASE}/service-calls/c-1`, () => HttpResponse.json(call())),
    http.get(`${BASE}/service-calls/c-1/assignments`, () => HttpResponse.json([])),
    http.get(`${BASE}/service-calls/c-1/visits`, () => HttpResponse.json([])),
    http.get(`${BASE}/service-calls/c-1/reports`, () => HttpResponse.json([])),
    http.get(`${BASE}/reports/service-activity`, () => HttpResponse.json({ by_status: [{ status: 'new', count: 2 }, { status: 'in_progress', count: 3 }, { status: 'closed', count: 5 }], total_calls: 10, average_resolution_minutes: 150 })),
  )
}

describe('Service call list', () => {
  it('staff see a summary and can log a call; employees do neither', async () => {
    setup()
    renderApp('/service')
    expect(await screen.findByRole('button', { name: 'Log a service call' })).toBeInTheDocument()
    const tile = (label: string) => screen.getByText(label, { selector: '.stat-label' }).closest('a')!
    await waitFor(() => expect(within(tile('Active calls')).getByText('5')).toBeInTheDocument()) // new 2 + in progress 3
    expect(within(tile('New, not yet assigned')).getByText('2')).toBeInTheDocument()
    expect(within(tile('Resolved or closed')).getByText('5')).toBeInTheDocument()
    expect(within(tile('Average time to resolve')).getByText('2h 30m')).toBeInTheDocument()
    expect(tile('New, not yet assigned')).toHaveAttribute('href', '/service?status=new')
  })

  it('employees get the technician view: no log button, no summary, and no request for it', async () => {
    let summaryRequests = 0
    setup(employee, [http.get(`${BASE}/reports/service-activity`, () => { summaryRequests += 1; return apiError(403, 'forbidden', 'no') })])
    renderApp('/service')
    expect(await screen.findByRole('heading', { level: 1, name: 'My service calls' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log a service call' })).not.toBeInTheDocument()
    expect(screen.queryByText('Active calls')).not.toBeInTheDocument()
    expect(summaryRequests).toBe(0) // a manager-only report is never requested for an employee
  })

  it('narrows to one customer or machine, shown as a chip with a way back', async () => {
    const seen = spy()
    setup(manager, [http.get(`${BASE}/service-calls`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([call()])) })])
    renderApp('/service?customer=cust-1&machine=mach-1')
    expect(await screen.findByRole('link', { name: 'Acme Forgings' })).toHaveAttribute('href', '/customers/cust-1')
    expect(await screen.findByRole('link', { name: 'MC-88' })).toHaveAttribute('href', '/machines/mach-1')
    await waitFor(() => {
      const q = seen.seen.at(-1)?.url.searchParams
      expect(q?.get('customer_id')).toBe('cust-1')
      expect(q?.get('machine_id')).toBe('mach-1')
    })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show calls for all customers and machines' }))
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('customer_id')).toBeNull())
  })
})

describe('Logging a service call', () => {
  async function open(who = manager, path = '/service', extra: Parameters<typeof server.use> = []) {
    setup(who, extra)
    renderApp(path)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Log a service call' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Log a service call' }))
    return { user, dialog }
  }

  it('walks customer -> machine -> contact -> problem, and sends exactly that', async () => {
    const seen = spy()
    const { user, dialog } = await open(manager, '/service', [
      http.post(`${BASE}/service-calls`, async ({ request }) => { await seen.record(request); return HttpResponse.json(call({ id: 'c-9', service_call_code: 'SC-9' }), { status: 201 }) }),
      http.get(`${BASE}/service-calls/c-9`, () => HttpResponse.json(call({ id: 'c-9', service_call_code: 'SC-9' }))),
      http.get(`${BASE}/service-calls/c-9/assignments`, () => HttpResponse.json([])),
      http.get(`${BASE}/service-calls/c-9/visits`, () => HttpResponse.json([])),
      http.get(`${BASE}/service-calls/c-9/reports`, () => HttpResponse.json([])),
    ])
    expect(dialog.getByLabelText(/^machine/i)).toBeDisabled() // customer first
    await user.click(dialog.getByRole('button', { name: 'Log service call' }))
    expect(await dialog.findByText('Choose the customer who called.')).toBeInTheDocument()
    await user.type(dialog.getByLabelText('Find customer'), 'Acme')
    await dialog.findByRole('option', { name: /Acme Forgings · CU-7/ })
    await user.selectOptions(dialog.getByLabelText(/^customer/i), 'cust-1')
    await dialog.findByRole('option', { name: /MC-88 · VMC-850 · SN-5521/ })
    await user.selectOptions(dialog.getByLabelText(/^machine/i), 'mach-1')
    await user.selectOptions(await dialog.findByLabelText('Reported by'), 'ct-1')
    const code = dialog.getByLabelText(/call number/i)
    await user.clear(code)
    await user.type(code, 'SC-9')
    await user.selectOptions(dialog.getByLabelText('Priority'), 'urgent')
    await user.selectOptions(dialog.getByLabelText('Type of service'), 'remote_support')
    await user.click(dialog.getByRole('button', { name: 'Log service call' }))
    expect(await dialog.findByText('Describe the problem the customer reported.')).toBeInTheDocument()
    await user.type(dialog.getByLabelText(/problem reported/i), 'Spindle vibrates')
    await user.click(dialog.getByRole('button', { name: 'Log service call' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toMatchObject({
      service_call_code: 'SC-9', customer_id: 'cust-1', machine_id: 'mach-1', reported_by_contact_id: 'ct-1',
      contact_method: 'phone', issue_reported: 'Spindle vibrates', priority: 'urgent', service_type: 'remote_support', responsible_manager_id: null,
    })
    // "Reported at" is typed in company time (IST) and sent as a UTC instant
    expect(seen.seen[0]?.body).toMatchObject({ contacted_at: expect.stringMatching(/Z$/) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Call SC-9' })).toBeInTheDocument()
  })

  it('opened from a customer it is prefilled, and says so when the customer has no machines', async () => {
    const { dialog } = await open(manager, '/customers/cust-1', [http.get(`${BASE}/machines`, () => HttpResponse.json(list([])))])
    // (the button on the customer page has the same name)
    expect(dialog.getByText('Acme Forgings')).toBeInTheDocument()
    expect(await dialog.findByText("Add the machine from the customer's page first.")).toBeInTheDocument()
  })

  it('opened from a machine it is prefilled with both', async () => {
    const { dialog } = await open(manager, '/machines/mach-1')
    expect(dialog.getByText('Acme Forgings')).toBeInTheDocument()
    expect(await dialog.findByRole('option', { name: /MC-88/ })).toBeInTheDocument()
    expect((dialog.getByLabelText(/^machine/i) as HTMLSelectElement).value).toBe('mach-1')
  })

  it('a manager can make themself or their own managers responsible; the owner can pick any manager', async () => {
    const { dialog } = await open(manager)
    const options = within(dialog.getByLabelText('Responsible manager')).getAllByRole('option').map((o) => o.textContent)
    expect(options.join('|')).toContain('You') // placeholder
    expect(options.join('|')).toContain('Manny Manager (you)')
    expect(options.join('|')).toContain('Sub Manager')
    expect(options.join('|')).not.toContain('Priya Peer') // outside the manager's line
  })

  it('the owner can pick any active manager', async () => {
    const { dialog } = await open(owner)
    await waitFor(() => expect(within(dialog.getByLabelText('Responsible manager')).getByRole('option', { name: /Priya Peer/ })).toBeInTheDocument())
  })

  it('shows the server\'s reason when the call number is taken', async () => {
    const { user, dialog } = await open(manager, '/customers/cust-1', [http.post(`${BASE}/service-calls`, () => apiError(409, 'conflict', 'service_call_code is already in use.'))])
    await user.selectOptions(await dialog.findByLabelText(/^machine/i), 'mach-1')
    await user.type(dialog.getByLabelText(/problem reported/i), 'x')
    await user.click(dialog.getByRole('button', { name: 'Log service call' }))
    expect(await dialog.findByText('service_call_code is already in use.')).toBeInTheDocument()
  })
})

describe('Service call page', () => {
  it('a manager edits only what changed', async () => {
    const seen = spy()
    setup(manager, [http.patch(`${BASE}/service-calls/c-1`, async ({ request }) => { await seen.record(request); return HttpResponse.json(call({ priority: 'low', resolution: 'Replaced bearings' })) })])
    renderApp('/service/c-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit call' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit call SC-1042' }))
    expect(dialog.queryByLabelText('Responsible manager')).not.toBeInTheDocument() // owner only
    await user.selectOptions(dialog.getByLabelText('Priority'), 'low')
    await user.type(dialog.getByLabelText('Resolution'), 'Replaced bearings')
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ priority: 'low', resolution: 'Replaced bearings' }))
  })

  it('only the owner can hand the call to another manager', async () => {
    const seen = spy()
    setup(owner, [http.patch(`${BASE}/service-calls/c-1`, async ({ request }) => { await seen.record(request); return HttpResponse.json(call({ responsible_manager_id: 'm-2' })) })])
    renderApp('/service/c-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit call' }))
    const dialog = within(await screen.findByRole('dialog'))
    await waitFor(() => expect(within(dialog.getByLabelText('Responsible manager')).getByRole('option', { name: /Priya Peer/ })).toBeInTheDocument())
    await user.selectOptions(dialog.getByLabelText('Responsible manager'), 'm-2')
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ responsible_manager_id: 'm-2' }))
  })

  it('an assigned employee cannot edit the call (status only)', async () => {
    setup(employee, [http.get(`${BASE}/service-calls/c-1/assignments`, () => HttpResponse.json([assignment]))])
    renderApp('/service/c-1')
    expect(await screen.findByRole('button', { name: 'Save status' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit call' })).not.toBeInTheDocument()
  })

  it('shows where the call is on its way: logged -> assigned -> visit -> report -> reviewed -> resolved', async () => {
    setup(manager, [
      http.get(`${BASE}/service-calls/c-1/assignments`, () => HttpResponse.json([assignment])),
      http.get(`${BASE}/service-calls/c-1/visits`, () => HttpResponse.json([visit])),
      http.get(`${BASE}/service-calls/c-1/reports`, () => HttpResponse.json([report()])),
    ])
    renderApp('/service/c-1')
    const steps = within(await screen.findByRole('list', { name: 'Progress of this call' }))
    await waitFor(() => expect(steps.getByText(/Report submitted/)).toHaveTextContent('done'))
    expect(steps.getByText(/Logged/)).toHaveTextContent('done')
    expect(steps.getByText(/Assigned/)).toHaveTextContent('done')
    expect(steps.getByText(/Visit recorded/)).toHaveTextContent('done')
    expect(steps.getByText(/Report reviewed/)).toHaveTextContent('next step')
    expect(steps.getByText(/Resolved/)).toHaveTextContent('not yet')
  })

  it('links the customer and the machine, and offers directions', async () => {
    setup(manager)
    renderApp('/service/c-1')
    expect(await screen.findByRole('link', { name: 'Acme Forgings' })).toHaveAttribute('href', '/customers/cust-1')
    expect(await screen.findByRole('link', { name: 'MC-88' })).toHaveAttribute('href', '/machines/mach-1')
    expect(screen.getByRole('link', { name: /Open in Maps/ })).toHaveAttribute('href', expect.stringContaining('Plot%209'))
  })
})
