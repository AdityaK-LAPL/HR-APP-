import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, manager, mockSession } from '@/test/api'
import { call, list, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const customer = { id: 'cust-1', customer_code: 'CU-7', name: 'Acme Forgings', address: 'Plot 9, Peenya', notes: null, is_active: true, created_at: '', updated_at: '' }
const machine = { id: 'mach-1', machine_code: 'MC-88', customer_id: 'cust-1', model_name: 'VMC-850', serial_number: 'SN-5521', installation_date: null, purchase_info: null, warranty_info: 'Until Dec 2026', location: 'Bay 4', status: 'active', is_active: true, created_at: '', updated_at: '' }
const contacts = [{ id: 'ct-1', customer_id: 'cust-1', name: 'Priya Nair', designation: 'Plant head', phone: '+91 98450 00000', email: 'priya@acme.example', is_primary: true }]
const visit = {
  id: 'v-1', service_call_id: 'c-1', employee_id: employee.id, visit_type: 'field_visit', visit_date: '2026-03-05',
  arrival_time: '2026-03-05T04:00:00Z', departure_time: null, latitude: null, longitude: null,
  work_performed: 'Checked spindle bearings', problem_found: null, parts_used: null, action_taken: null, result: null,
  customer_signoff: null, created_at: '2026-03-05T04:00:00Z',
}

function setupCall(extra: Parameters<typeof server.use> = []) {
  mockSession(employee)
  server.use(
    ...extra, // overrides first: MSW uses the first handler that matches
    http.get(`${BASE}/service-calls`, () => HttpResponse.json(list([call()]))),
    http.get(`${BASE}/service-calls/c-1`, () => HttpResponse.json(call())),
    http.get(`${BASE}/service-calls/c-1/assignments`, () => HttpResponse.json([
      { id: 'as-1', service_call_id: 'c-1', employee_id: employee.id, assigned_by: manager.id, assigned_at: '2026-03-05T05:00:00Z', role_in_call: null, is_active: true, unassigned_at: null },
    ])),
    http.get(`${BASE}/service-calls/c-1/visits`, () => HttpResponse.json([visit])),
    http.get(`${BASE}/service-calls/c-1/reports`, () => HttpResponse.json([])),
    http.get(`${BASE}/customers/cust-1`, () => HttpResponse.json(customer)),
    http.get(`${BASE}/customers/cust-1/contacts`, () => HttpResponse.json(contacts)),
    http.get(`${BASE}/machines/mach-1`, () => HttpResponse.json(machine)),
  )
}

describe('Service calls list', () => {
  it('lists assigned calls with the customer name, status and priority', async () => {
    setupCall()
    renderApp('/service')
    const link = await screen.findByRole('link', { name: 'SC-1042' })
    expect(link).toHaveAttribute('href', '/service/c-1')
    expect(await screen.findByText('Acme Forgings')).toBeInTheDocument()
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Assigned')).toBeInTheDocument()
    expect(table.getByText('Urgent')).toBeInTheDocument()
  })

  it('searches by call number', async () => {
    setupCall()
    const seen = spy()
    server.use(http.get(`${BASE}/service-calls`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([])) }))
    renderApp('/service')
    await userEvent.setup().type(await screen.findByLabelText('Call number'), 'SC-9')
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('service_call_code')).toBe('SC-9'))
  })

  it('has an empty state', async () => {
    setupCall([http.get(`${BASE}/service-calls`, () => HttpResponse.json(list([])))])
    renderApp('/service')
    expect(await screen.findByText('No service calls assigned to you')).toBeInTheDocument()
  })
})

describe('Service call detail', () => {
  it('shows the call, customer with contacts, machine, team and visits', async () => {
    setupCall()
    renderApp('/service/c-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Call SC-1042' })).toBeInTheDocument()
    expect(await screen.findByText('Acme Forgings')).toBeInTheDocument()
    expect(await screen.findByText('Priya Nair')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+91 98450 00000' })).toHaveAttribute('href', 'tel:+91 98450 00000')
    expect(await screen.findByText('VMC-850')).toBeInTheDocument()
    expect(screen.getByText('Checked spindle bearings')).toBeInTheDocument()
    expect(screen.getByText("You haven't submitted a report for this call yet.")).toBeInTheDocument()
  })

  it('degrades gracefully when the customer or machine cannot be read', async () => {
    setupCall([
      http.get(`${BASE}/customers/cust-1`, () => apiError(404, 'not_found', 'x')),
      http.get(`${BASE}/customers/cust-1/contacts`, () => apiError(404, 'not_found', 'x')),
      http.get(`${BASE}/machines/mach-1`, () => apiError(403, 'forbidden', 'x')),
    ])
    renderApp('/service/c-1')
    expect(await screen.findByText('Customer details are not available to you.')).toBeInTheDocument()
    expect(await screen.findByText('Machine details are not available to you.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Call SC-1042' })).toBeInTheDocument()
  })

  it('updates only the status', async () => {
    const seen = spy()
    setupCall([http.patch(`${BASE}/service-calls/c-1`, async ({ request }) => { await seen.record(request); return HttpResponse.json(call({ status: 'in_progress' })) })])
    renderApp('/service/c-1')
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Call status'), 'in_progress')
    await user.click(screen.getByRole('button', { name: 'Save status' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toEqual({ status: 'in_progress' })
  })

  it('records a visit, converting the typed IST times to UTC', async () => {
    const seen = spy()
    setupCall([http.post(`${BASE}/service-calls/c-1/visits`, async ({ request }) => { await seen.record(request); return HttpResponse.json(visit, { status: 201 }) })])
    renderApp('/service/c-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Record a visit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Record a visit' })
    expect(within(dialog).getByLabelText(/^type/i)).toHaveValue('field_visit') // from the call's service type
    await user.type(within(dialog).getByLabelText(/^arrived/i), '2026-03-05T09:30')
    await user.type(within(dialog).getByLabelText(/^left/i), '2026-03-05T11:00')
    await user.type(within(dialog).getByLabelText(/work performed/i), 'Replaced spindle bearings')
    await user.click(within(dialog).getByRole('button', { name: 'Save visit' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toMatchObject({
      visit_type: 'field_visit',
      visit_date: '2026-03-05',
      arrival_time: '2026-03-05T04:00:00.000Z',
      departure_time: '2026-03-05T05:30:00.000Z',
      work_performed: 'Replaced spindle bearings',
      latitude: null,
      longitude: null,
    })
  })

  it('will not save a visit that ends before it starts, or has no work described', async () => {
    let posts = 0
    setupCall([http.post(`${BASE}/service-calls/c-1/visits`, () => { posts += 1; return HttpResponse.json(visit) })])
    renderApp('/service/c-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Record a visit' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^arrived/i), '2026-03-05T11:00')
    await user.type(within(dialog).getByLabelText(/^left/i), '2026-03-05T09:00')
    await user.click(within(dialog).getByRole('button', { name: 'Save visit' }))
    expect(await within(dialog).findByText('You cannot leave before you arrive.')).toBeInTheDocument()
    expect(within(dialog).getByText('Describe the work you did.')).toBeInTheDocument()
    expect(posts).toBe(0)
  })

  it('edits an existing visit with a PATCH (the type is fixed)', async () => {
    const seen = spy()
    setupCall([http.patch(`${BASE}/service-visits/v-1`, async ({ request }) => { await seen.record(request); return HttpResponse.json(visit) })])
    renderApp('/service/c-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit visit' })
    expect(within(dialog).getByLabelText(/^type/i)).toBeDisabled()
    expect(within(dialog).getByLabelText(/work performed/i)).toHaveValue('Checked spindle bearings')
    await user.type(within(dialog).getByLabelText(/^result/i), 'Bearings replaced')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toMatchObject({ result: 'Bearings replaced', work_performed: 'Checked spindle bearings' })
    expect(seen.seen[0]?.body).not.toHaveProperty('visit_type')
  })

  it('submits the service report with its required sections', async () => {
    const seen = spy()
    setupCall([http.post(`${BASE}/service-calls/c-1/report`, async ({ request }) => { await seen.record(request); return HttpResponse.json({}, { status: 201 }) })])
    renderApp('/service/c-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Submit report' }))
    const dialog = await screen.findByRole('dialog', { name: /service report/i })
    await user.click(within(dialog).getByRole('button', { name: 'Submit report' }))
    expect(await within(dialog).findByText('Describe the work performed.')).toBeInTheDocument()
    expect(seen.seen).toHaveLength(0)

    await user.type(within(dialog).getByLabelText(/^work performed/i), 'Replaced bearings')
    await user.type(within(dialog).getByLabelText(/^problem found/i), 'Worn bearings')
    await user.type(within(dialog).getByLabelText(/^action taken/i), 'Fitted new set')
    await user.type(within(dialog).getByLabelText(/^result/i), 'Vibration gone')
    await user.selectOptions(within(dialog).getByLabelText(/related visit/i), 'v-1')
    await user.click(within(dialog).getByRole('button', { name: 'Submit report' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toMatchObject({
      service_visit_id: 'v-1', work_performed: 'Replaced bearings', problem_found: 'Worn bearings',
      action_taken: 'Fitted new set', result: 'Vibration gone', root_cause: null,
    })
  })

  it('shows the employee\'s own report and whether a manager has reviewed it', async () => {
    setupCall([
      http.get(`${BASE}/service-calls/c-1/reports`, () => HttpResponse.json([{
        id: 'r-1', service_call_id: 'c-1', service_visit_id: null, employee_id: employee.id, report_datetime: '2026-03-05T10:00:00Z',
        service_type: 'field_visit', work_performed: 'Replaced bearings', problem_found: 'Worn', root_cause: null, action_taken: 'Fitted',
        parts_used: null, result: 'Fixed', pending_work: null, recommendations: null, employee_comments: null,
        reviewed_by: manager.id, reviewed_at: '2026-03-06T05:00:00Z', submitted_at: '2026-03-05T10:00:00Z',
      }])),
    ])
    renderApp('/service/c-1')
    expect(await screen.findByText(/reviewed by manny manager/i)).toBeInTheDocument()
    expect(screen.getByText('Replaced bearings', { selector: 'dd' })).toBeInTheDocument()
  })
})

describe('Visit editing', () => {
  it('offers Edit only on the employee\'s own visits', async () => {
    setupCall([
      http.get(`${BASE}/service-calls/c-1/visits`, () => HttpResponse.json([
        visit,
        { ...visit, id: 'v-2', employee_id: manager.id, work_performed: 'Manager walk-through' },
      ])),
    ])
    renderApp('/service/c-1')
    expect(await screen.findByText('Manager walk-through')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
  })
})

describe('Customer names in lists', () => {
  it('falls back to a neutral label (not an endless "…") when the customer cannot be read', async () => {
    setupCall([http.get(`${BASE}/customers/cust-1`, () => apiError(404, 'not_found', 'Customer not found.'))])
    renderApp('/service')
    const table = within(await screen.findByRole('table'))
    expect(await table.findByRole('cell', { name: 'Customer' })).toBeInTheDocument()
    expect(table.queryByText('…')).not.toBeInTheDocument()
  })
})
