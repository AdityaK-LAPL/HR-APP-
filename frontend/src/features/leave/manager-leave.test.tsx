import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, manager, mockSession, owner } from '@/test/api'
import { leave, list, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const team = [{ id: employee.id, name: employee.name, employee_code: 'EMP001', designation: null, role: 'employee', manager_id: manager.id, is_active: true, created_at: '', updated_at: '' }]

function setup(leaves: ReturnType<typeof leave>[], extra: Parameters<typeof server.use> = []) {
  mockSession(manager)
  server.use(
    ...extra,
    http.get(`${BASE}/leaves`, () => HttpResponse.json(list(leaves))),
    http.get(`${BASE}/users`, () => HttpResponse.json(list(team))),
  )
}

describe('Leave for a manager', () => {
  it('opens on the requests waiting to be decided and asks the API for pending ones', async () => {
    const seen = spy()
    setup([leave()], [http.get(`${BASE}/leaves`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([leave()])) })])
    renderApp('/leaves')
    expect(await screen.findByRole('heading', { level: 1, name: 'Leave' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Approve leave for Erin Employee' })).toBeInTheDocument()
    expect(seen.seen[0]?.url.searchParams.get('status')).toBe('pending')
  })

  it('approves with an optional note', async () => {
    const seen = spy()
    setup([leave()], [http.post(`${BASE}/leaves/l-1/approve`, async ({ request }) => { await seen.record(request); return HttpResponse.json(leave({ status: 'approved', current_approver_id: null })) })])
    renderApp('/leaves')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Approve leave for Erin Employee' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Approve leave request' }))
    expect(dialog.getByText(/3 days/)).toBeInTheDocument()
    await user.type(dialog.getByLabelText(/note to the employee/i), 'Enjoy')
    await user.click(dialog.getByRole('button', { name: 'Approve request' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ comments: 'Enjoy' }))
    expect(await screen.findByText('Leave request approved.')).toBeInTheDocument()
  })

  it('will not reject without a reason, then sends it', async () => {
    const seen = spy()
    setup([leave()], [http.post(`${BASE}/leaves/l-1/reject`, async ({ request }) => { await seen.record(request); return HttpResponse.json(leave({ status: 'rejected' })) })])
    renderApp('/leaves')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Reject leave for Erin Employee' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Reject leave request' }))
    const submit = dialog.getByRole('button', { name: 'Reject request' })
    expect(submit).toBeDisabled()
    await user.type(dialog.getByLabelText(/reason for rejecting/i), 'Release week')
    await user.click(submit)
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ comments: 'Release week' }))
  })

  it('shows the server\'s refusal inside the dialog', async () => {
    setup([leave()], [http.post(`${BASE}/leaves/l-1/approve`, () => apiError(403, 'forbidden', 'Only the current approver can decide this request.'))])
    renderApp('/leaves')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Approve leave for Erin Employee' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve request' }))
    expect(await screen.findByText('Only the current approver can decide this request.')).toBeInTheDocument()
  })

  it('offers no decision on a request that is waiting on someone else', async () => {
    setup([leave({ current_approver_id: owner.id })])
    renderApp('/leaves')
    expect(await screen.findByText('Olivia Owner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Approve leave/ })).not.toBeInTheDocument()
  })

  it('shows decided requests without decision buttons when the status filter is cleared', async () => {
    setup([leave({ status: 'approved', current_approver_id: null })])
    renderApp('/leaves?status=all')
    expect(await screen.findByText('Approved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Approve leave/ })).not.toBeInTheDocument()
  })

  it('has an empty state when nothing is waiting', async () => {
    setup([])
    renderApp('/leaves')
    expect(await screen.findByText('Nothing waiting for a decision')).toBeInTheDocument()
  })

  it('"My leave" lists the manager\'s own requests, can apply, and can cancel a pending one', async () => {
    const seen = spy()
    setup([leave({ employee_id: manager.id, current_approver_id: owner.id })], [
      http.get(`${BASE}/leaves`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([leave({ employee_id: manager.id, current_approver_id: owner.id })])) }),
      http.post(`${BASE}/leaves/l-1/cancel`, () => HttpResponse.json(leave({ status: 'cancelled' }))),
    ])
    renderApp('/leaves')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'My leave' }))
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('employee_id')).toBe(manager.id))
    expect(seen.seen.at(-1)?.url.searchParams.get('status')).toBeNull() // all of my requests
    await user.click(await screen.findByRole('button', { name: 'Cancel request' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel request' }))
    expect(await screen.findByText('Leave request cancelled.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply for leave' })).toBeInTheDocument()
  })

  it('filters the team requests by employee', async () => {
    const seen = spy()
    setup([], [http.get(`${BASE}/leaves`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([])) })])
    renderApp('/leaves')
    await screen.findByRole('option', { name: /Erin Employee/ })
    await userEvent.setup().selectOptions(screen.getByLabelText('Employee'), employee.id)
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('employee_id')).toBe(employee.id))
  })
})
