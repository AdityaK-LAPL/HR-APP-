import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, mockSession } from '@/test/api'
import { leave, list, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

describe('My leave', () => {
  it('shows each request with its status, length, and who it is waiting on', async () => {
    mockSession(employee)
    server.use(
      http.get(`${BASE}/leaves`, () =>
        HttpResponse.json(list([leave(), leave({ id: 'l-2', status: 'approved', current_approver_id: null, start_date: '2026-02-02', end_date: '2026-02-02', reason: null })])),
      ),
    )
    renderApp('/leaves')
    const table = within(await screen.findByRole('table'))
    expect(await table.findByText('Pending')).toBeInTheDocument()
    expect(table.getByText('Approved')).toBeInTheDocument()
    expect(table.getAllByText('3')).not.toHaveLength(0) // 10-12 Mar = 3 days
    expect(await table.findByText('Manny Manager')).toBeInTheDocument() // waiting on
  })

  it('applies for leave with the entered dates and reason', async () => {
    mockSession(employee)
    const seen = spy()
    server.use(
      http.post(`${BASE}/leaves`, async ({ request }) => {
        await seen.record(request)
        return HttpResponse.json(leave(), { status: 201 })
      }),
    )
    renderApp('/leaves')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Apply for leave' }))
    const dialog = await screen.findByRole('dialog', { name: 'Apply for leave' })
    const from = within(dialog).getByLabelText(/^from/i)
    const to = within(dialog).getByLabelText(/^to/i)
    expect(from).toHaveValue('2026-03-05') // defaults to the company's today
    await user.clear(from); await user.type(from, '2026-03-10')
    await user.clear(to); await user.type(to, '2026-03-12')
    expect(await within(dialog).findByText('3 days of leave')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/reason/i), '  Family function  ')
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toEqual({ start_date: '2026-03-10', end_date: '2026-03-12', reason: 'Family function', leave_kind: 'full_day' })
    expect(await screen.findByText('Leave request sent for approval.')).toBeInTheDocument()
  })

  it('applies for half a day on one date, and for a compensatory off that uses no leave', async () => {
    mockSession(employee)
    const seen = spy()
    server.use(http.post(`${BASE}/leaves`, async ({ request }) => { await seen.record(request); return HttpResponse.json(leave(), { status: 201 }) }))
    renderApp('/leaves')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Apply for leave' }))
    const dialog = await screen.findByRole('dialog', { name: 'Apply for leave' })

    await user.selectOptions(within(dialog).getByLabelText('Type of leave'), 'half_day')
    expect(within(dialog).queryByLabelText(/^to/i)).not.toBeInTheDocument() // one date only
    expect(await within(dialog).findByText('0.5 days of leave')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toEqual({ start_date: '2026-03-05', end_date: '2026-03-05', reason: null, leave_kind: 'half_day' })
  })

  it('says a compensatory off counts as no leave', async () => {
    mockSession(employee)
    renderApp('/leaves')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Apply for leave' }))
    const dialog = await screen.findByRole('dialog', { name: 'Apply for leave' })
    await user.selectOptions(within(dialog).getByLabelText('Type of leave'), 'comp_off')
    expect(await within(dialog).findByText(/counts as 0 days of leave/i)).toBeInTheDocument()
  })

  it('rejects an end date before the start date without calling the server', async () => {
    mockSession(employee)
    let posts = 0
    server.use(http.post(`${BASE}/leaves`, () => { posts += 1; return HttpResponse.json(leave()) }))
    renderApp('/leaves')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Apply for leave' }))
    const dialog = await screen.findByRole('dialog')
    const to = within(dialog).getByLabelText(/^to/i)
    await user.clear(to); await user.type(to, '2026-03-01')
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }))
    expect(await within(dialog).findByText('The last day cannot be before the first day.')).toBeInTheDocument()
    expect(posts).toBe(0)
  })

  it('shows the server\'s reason when a request is refused', async () => {
    mockSession(employee)
    server.use(http.post(`${BASE}/leaves`, () => apiError(409, 'conflict', 'You already have leave in this period.')))
    renderApp('/leaves')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Apply for leave' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You already have leave in this period.')
  })

  it('cancels a pending request only after confirmation', async () => {
    mockSession(employee)
    let cancelled = 0
    server.use(
      http.get(`${BASE}/leaves`, () => HttpResponse.json(list([leave()]))),
      http.post(`${BASE}/leaves/l-1/cancel`, () => { cancelled += 1; return HttpResponse.json(leave({ status: 'cancelled' })) }),
    )
    renderApp('/leaves')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Cancel request' }))
    const dialog = await screen.findByRole('dialog', { name: /cancel this leave request/i })
    await user.click(within(dialog).getByRole('button', { name: 'Keep request' }))
    expect(cancelled).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Cancel request' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel request' }))
    await waitFor(() => expect(cancelled).toBe(1))
    expect(await screen.findByText('Leave request cancelled.')).toBeInTheDocument()
  })

  it('offers no cancel button for a decided request', async () => {
    mockSession(employee)
    server.use(http.get(`${BASE}/leaves`, () => HttpResponse.json(list([leave({ status: 'rejected' })]))))
    renderApp('/leaves')
    await screen.findByText('Rejected')
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument()
  })
})
