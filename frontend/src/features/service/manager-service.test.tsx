import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, manager, mockSession, owner } from '@/test/api'
import { call, list, person, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const customer = { id: 'cust-1', customer_code: 'CU-7', name: 'Acme Forgings', address: null, notes: null, is_active: true, created_at: '', updated_at: '' }
const machine = { id: 'mach-1', machine_code: 'MC-88', customer_id: 'cust-1', model_name: 'VMC-850', serial_number: 'SN-5521', installation_date: null, purchase_info: null, warranty_info: null, location: null, status: 'active', is_active: true, created_at: '', updated_at: '' }
const assignment = { id: 'as-1', service_call_id: 'c-1', employee_id: employee.id, assigned_by: manager.id, assigned_at: '2026-03-05T05:00:00Z', role_in_call: 'Lead', is_active: true, unassigned_at: null }
const visit = {
  id: 'v-1', service_call_id: 'c-1', employee_id: employee.id, visit_type: 'field_visit', visit_date: '2026-03-05',
  arrival_time: null, departure_time: null, latitude: null, longitude: null, work_performed: 'Checked bearings',
  problem_found: null, parts_used: null, action_taken: null, result: null, customer_signoff: null, created_at: '2026-03-05T04:00:00Z',
}
const report = (over = {}) => ({
  id: 'r-1', service_call_id: 'c-1', service_visit_id: null, employee_id: employee.id, report_datetime: '2026-03-05T08:00:00Z',
  service_type: 'field_visit', work_performed: 'Replaced bearings', problem_found: 'Worn', root_cause: null, action_taken: 'Fitted',
  parts_used: null, result: 'Vibration gone', pending_work: null, recommendations: null, employee_comments: null,
  reviewed_by: null, reviewed_at: null, submitted_at: '2026-03-05T09:00:00Z', ...over,
})

function setup(extra: Parameters<typeof server.use> = [], opts: { responsible?: string } = {}) {
  mockSession(manager)
  server.use(
    ...extra,
    http.get(`${BASE}/users/${manager.id}/subordinates`, () => HttpResponse.json([person(), person({ id: 'e-2', name: 'Eli Engineer' })])),
    http.get(`${BASE}/users`, () => HttpResponse.json(list([person()]))),
    http.get(`${BASE}/service-calls`, () => HttpResponse.json(list([call({ responsible_manager_id: opts.responsible ?? manager.id })]))),
    http.get(`${BASE}/service-calls/c-1`, () => HttpResponse.json(call({ responsible_manager_id: opts.responsible ?? manager.id }))),
    http.get(`${BASE}/service-calls/c-1/assignments`, () => HttpResponse.json([assignment])),
    http.get(`${BASE}/service-calls/c-1/visits`, () => HttpResponse.json([visit])),
    http.get(`${BASE}/service-calls/c-1/reports`, () => HttpResponse.json([report()])),
    http.get(`${BASE}/customers/cust-1`, () => HttpResponse.json(customer)),
    http.get(`${BASE}/customers/cust-1/contacts`, () => HttpResponse.json([])),
    http.get(`${BASE}/machines/mach-1`, () => HttpResponse.json(machine)),
  )
}

describe('Service calls for a manager', () => {
  it('lists calls with the responsible manager and filters by assignee and responsibility', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/service-calls`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([call()])) })])
    renderApp('/service')
    expect(await screen.findByRole('heading', { level: 1, name: 'Service calls' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'SC-1042' })).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('You')).toBeInTheDocument() // responsible manager
    const user = userEvent.setup()
    await screen.findByRole('option', { name: /Erin Employee/ })
    await user.selectOptions(screen.getByLabelText('Assigned to'), employee.id)
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('employee_id')).toBe(employee.id))
    await user.selectOptions(screen.getByLabelText('Responsibility'), 'responsible')
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('manager_id')).toBe(manager.id))
  })

  it('has an empty state', async () => {
    setup([http.get(`${BASE}/service-calls`, () => HttpResponse.json(list([])))])
    renderApp('/service')
    expect(await screen.findByText('No service calls yet')).toBeInTheDocument()
  })
})

describe('Service call detail for the responsible manager', () => {
  it('shows the assigned team, status, visits and reports to review - but no "submit report"', async () => {
    setup()
    renderApp('/service/c-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Call SC-1042' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Assign someone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save status' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record a visit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument() // may correct any visit on a managed call
    expect(await screen.findByRole('button', { name: 'Review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit report' })).not.toBeInTheDocument()
    expect(screen.getByText(/Erin Employee submitted/)).toBeInTheDocument()
  })

  it('assigns a team member', async () => {
    const seen = spy()
    setup([http.post(`${BASE}/service-calls/c-1/assign`, async ({ request }) => { await seen.record(request); return HttpResponse.json({ ...assignment, id: 'as-2', employee_id: 'e-2' }, { status: 201 }) })])
    renderApp('/service/c-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Assign someone' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Assign to this call' }))
    await dialog.findByRole('option', { name: /Eli Engineer/ })
    expect(dialog.queryByRole('option', { name: /Erin Employee/ })).not.toBeInTheDocument() // already on the call
    await user.selectOptions(dialog.getByLabelText(/^person/i), 'e-2')
    await user.type(dialog.getByLabelText(/role on this call/i), 'Support')
    await user.click(dialog.getByRole('button', { name: 'Assign' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ employee_id: 'e-2', role_in_call: 'Support' }))
  })

  it('unassigns only after confirmation', async () => {
    let removed = 0
    setup([http.delete(`${BASE}/service-calls/c-1/assign/as-1`, () => { removed += 1; return new HttpResponse(null, { status: 204 }) })])
    renderApp('/service/c-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Remove Erin Employee from this call' }))
    expect(removed).toBe(0)
    await user.click(within(await screen.findByRole('dialog', { name: 'Remove from this call?' })).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(removed).toBe(1))
  })

  it('reviews a submitted report with a comment', async () => {
    const seen = spy()
    setup([http.post(`${BASE}/service-reports/r-1/review`, async ({ request }) => { await seen.record(request); return HttpResponse.json(report({ reviewed_by: manager.id, reviewed_at: '2026-03-06T05:00:00Z' })) })])
    renderApp('/service/c-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Review' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Review service report' }))
    await user.type(dialog.getByLabelText('Comments'), 'Good work')
    await user.click(dialog.getByRole('button', { name: 'Mark as reviewed' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ comments: 'Good work' }))
  })

  it('shows the server\'s reason if assigning is refused', async () => {
    setup([http.post(`${BASE}/service-calls/c-1/assign`, () => apiError(403, 'forbidden', 'You cannot assign this employee.'))])
    renderApp('/service/c-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Assign someone' }))
    const dialog = within(await screen.findByRole('dialog'))
    await dialog.findByRole('option', { name: /Eli Engineer/ })
    await user.selectOptions(dialog.getByLabelText(/^person/i), 'e-2')
    await user.click(dialog.getByRole('button', { name: 'Assign' }))
    expect(await dialog.findByText('You cannot assign this employee.')).toBeInTheDocument()
  })
})

describe('Service call detail for a manager who is not responsible', () => {
  it('is read-only without a grant', async () => {
    setup([], { responsible: owner.id })
    renderApp('/service/c-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Call SC-1042' })).toBeInTheDocument()
    await screen.findAllByText(/Erin Employee/) // the team section has loaded
    expect(screen.queryByRole('button', { name: 'Assign someone' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save status' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record a visit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
  })

  it('may assign when the Owner granted assign_employees_to_service_call for the responsible manager', async () => {
    setup(
      [http.get(`${BASE}/permissions/me`, () => HttpResponse.json({ role: 'manager', unrestricted: false, role_defaults: [], grants: [{ permission_key: 'assign_employees_to_service_call', scope_type: 'user', scope_id: owner.id, effect: 'allow', expires_at: null }] }))],
      { responsible: owner.id },
    )
    renderApp('/service/c-1')
    expect(await screen.findByRole('button', { name: 'Assign someone' })).toBeInTheDocument()
  })
})
