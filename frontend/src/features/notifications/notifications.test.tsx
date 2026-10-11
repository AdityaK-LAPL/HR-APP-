import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, employee, manager, mockSession } from '@/test/api'
import { spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const note = (over = {}) => ({
  id: 'n-1', recipient_user_id: manager.id, type: 'leave_requested', payload: { message: 'Erin Employee asked for leave.' },
  read_at: null, created_at: '2026-03-05T05:00:00Z', ...over,
})

describe('Notifications', () => {
  it('shows the unread count on the bell', async () => {
    mockSession(manager)
    server.use(http.get(`${BASE}/notifications`, () => HttpResponse.json({ items: [note()], total: 7 })))
    renderApp('/dashboard')
    expect(await screen.findByRole('button', { name: 'Notifications, 7 unread' })).toBeInTheDocument()
  })

  it('shows a plain bell when nothing is unread, for every role', async () => {
    mockSession(employee)
    renderApp('/dashboard')
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('lists notifications generically without inventing links', async () => {
    mockSession(manager)
    server.use(
      http.get(`${BASE}/notifications`, () =>
        HttpResponse.json({
          items: [note(), note({ id: 'n-2', type: 'task.assigned', payload: { task_title: 'Calibrate', priority: 'high', nested: { a: 1 } }, read_at: '2026-03-05T06:00:00Z' }), note({ id: 'n-3', type: 'custom_event', payload: null })],
          total: 3,
        }),
      ),
    )
    renderApp('/notifications')
    const list = within(await screen.findByRole('list', { name: 'Notifications' }))
    expect(list.getByText('Leave requested')).toBeInTheDocument()
    expect(list.getByText('Erin Employee asked for leave.')).toBeInTheDocument()
    expect(list.getByText('Task assigned')).toBeInTheDocument()
    expect(list.getByText('Task title: Calibrate')).toBeInTheDocument()
    expect(list.queryByText(/nested/i)).not.toBeInTheDocument() // non-primitive payload parts are not dumped
    expect(list.getByText('Custom event')).toBeInTheDocument()
    expect(list.queryByRole('link')).not.toBeInTheDocument()
    expect(list.getAllByText('New')).toHaveLength(2) // n-1 and n-3 are unread
  })

  it('marks one notification as read', async () => {
    mockSession(manager)
    const seen = spy()
    server.use(
      http.get(`${BASE}/notifications`, () => HttpResponse.json({ items: [note()], total: 1 })),
      http.post(`${BASE}/notifications/n-1/read`, async ({ request }) => { await seen.record(request); return HttpResponse.json(note({ read_at: '2026-03-05T07:00:00Z' })) }),
    )
    renderApp('/notifications')
    await userEvent.setup().click(await screen.findByRole('button', { name: /Mark “Leave requested” as read/ }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
  })

  it('marks everything as read', async () => {
    mockSession(manager)
    let calls = 0
    server.use(
      http.get(`${BASE}/notifications`, () => HttpResponse.json({ items: [note()], total: 1 })),
      http.post(`${BASE}/notifications/read-all`, () => { calls += 1; return new HttpResponse(null, { status: 204 }) }),
    )
    renderApp('/notifications')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Mark all as read' }))
    await waitFor(() => expect(calls).toBe(1))
    expect(await screen.findByText('All notifications marked as read.')).toBeInTheDocument()
  })

  it('asks the API for unread ones only when filtered, and has empty states', async () => {
    mockSession(manager)
    const seen = spy()
    server.use(http.get(`${BASE}/notifications`, async ({ request }) => { await seen.record(request); return HttpResponse.json({ items: [], total: 0 }) }))
    renderApp('/notifications')
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Unread' }))
    expect(await screen.findByText('You are all caught up')).toBeInTheDocument()
    expect(seen.seen.some((s) => s.url.searchParams.get('unread_only') === 'true')).toBe(true)
  })
})
