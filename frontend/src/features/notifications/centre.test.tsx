import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, manager, mockSession } from '@/test/api'
import { spy, task } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const TASK_ID = '0b2d6f1e-3c4a-4b8e-9d1f-7a5c3e2b1a09'
const note = (over = {}) => ({
  id: 'n-1', recipient_user_id: manager.id, type: 'task_assigned',
  payload: { message: 'You were given “Calibrate press line 3”.', entity_type: 'task', entity_id: TASK_ID },
  read_at: null, created_at: new Date(Date.now() - 5 * 60_000).toISOString(), ...over,
})

function setup(who = manager, notes = [note()], extra: Parameters<typeof server.use> = []) {
  mockSession(who)
  server.use(
    ...extra,
    http.get(`${BASE}/notifications`, ({ request }) => {
      const unreadOnly = new URL(request.url).searchParams.get('unread_only') === 'true'
      const items = unreadOnly ? notes.filter((x) => !x.read_at) : notes
      return HttpResponse.json({ items, total: items.length })
    }),
  )
}

describe('Notification centre (header)', () => {
  it('opens a panel with the latest notifications, newest first, new ones marked, with a way to see all', async () => {
    setup(manager, [note(), note({ id: 'n-2', type: 'leave_approved', payload: null, read_at: '2026-03-05T08:00:00Z' })])
    renderApp('/dashboard')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }))
    const panel = within(await screen.findByRole('region', { name: 'Notifications' }))
    const items = await panel.findAllByRole('button', { name: /Task assigned|Leave approved/ })
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('New')
    expect(items[0]).toHaveTextContent('You were given “Calibrate press line 3”.')
    expect(items[0]).toHaveTextContent('5 min ago')
    expect(items[1]).not.toHaveTextContent('New')
    expect(panel.getByRole('link', { name: 'See all notifications' })).toHaveAttribute('href', '/notifications')
  })

  it('opening one marks it read and goes to the record it names', async () => {
    const seen = spy()
    setup(manager, [note()], [
      http.post(`${BASE}/notifications/n-1/read`, async ({ request }) => { await seen.record(request); return HttpResponse.json(note({ read_at: '2026-03-05T10:00:00Z' })) }),
      http.get(`${BASE}/tasks/${TASK_ID}`, () => HttpResponse.json(task({ id: TASK_ID, title: 'Calibrate press line 3' }))),
      http.get(`${BASE}/tasks/${TASK_ID}/history`, () => HttpResponse.json([])),
    ])
    const { router } = renderApp('/dashboard')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Notifications, 1 unread/ }))
    await user.click(await screen.findByRole('button', { name: /Task assigned/ }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(router.state.location.pathname).toBe(`/tasks/${TASK_ID}`)
    expect(screen.queryByRole('region', { name: 'Notifications' })).not.toBeInTheDocument() // the panel closes
  })

  it('a notification that names no record opens its details instead', async () => {
    setup(manager, [note({ payload: { message: 'Something happened.' } })], [http.post(`${BASE}/notifications/n-1/read`, () => HttpResponse.json(note({ read_at: 'x' })))])
    const { router } = renderApp('/dashboard')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Notifications, 1 unread/ }))
    await user.click(await screen.findByRole('button', { name: /Task assigned/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/notifications'))
    expect(router.state.location.search).toBe('?open=n-1')
    expect(await screen.findByRole('dialog', { name: 'Task assigned' })).toBeInTheDocument()
  })

  it('"Mark all read" empties the unread count', async () => {
    let called = 0
    const notes = [note()]
    setup(manager, notes, [http.post(`${BASE}/notifications/read-all`, () => { called += 1; notes[0] = note({ read_at: 'x' }); return new HttpResponse(null, { status: 204 }) })])
    renderApp('/dashboard')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Notifications, 1 unread/ }))
    await user.click(await screen.findByRole('button', { name: 'Mark all read' }))
    await waitFor(() => expect(called).toBe(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()) // no "unread" any more
  })

  it('closes on Escape (returning focus to the bell) and on an outside click', async () => {
    setup()
    renderApp('/dashboard')
    const user = userEvent.setup()
    const bell = await screen.findByRole('button', { name: /Notifications/ })
    await user.click(bell)
    expect(await screen.findByRole('region', { name: 'Notifications' })).toBeInTheDocument()
    expect(bell).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Notifications' })).not.toBeInTheDocument()
    expect(bell).toHaveFocus()
    await user.click(bell)
    await screen.findByRole('region', { name: 'Notifications' })
    await user.click(document.body)
    expect(screen.queryByRole('region', { name: 'Notifications' })).not.toBeInTheDocument()
  })

  it('has an empty state', async () => {
    setup(manager, [])
    renderApp('/dashboard')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(await screen.findByText('You have no notifications.')).toBeInTheDocument()
  })

  it('shows the neutral error when the list cannot be read, without breaking the page', async () => {
    mockSession(employee)
    server.use(http.get(`${BASE}/notifications`, ({ request }) => (new URL(request.url).searchParams.get('unread_only') ? HttpResponse.json({ items: [], total: 0 }) : apiError(403, 'forbidden', 'no'))))
    renderApp('/dashboard')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /Hello, Erin/ })).toBeInTheDocument()
  })

  it('does not load the list until the panel is opened', async () => {
    const lists = spy()
    setup(manager, [note()], [http.get(`${BASE}/notifications`, async ({ request }) => { await lists.record(request); return HttpResponse.json({ items: [note()], total: 1 }) })])
    renderApp('/dashboard')
    await screen.findByRole('button', { name: /Notifications, 1 unread/ })
    expect(lists.seen.every((s) => s.url.searchParams.get('unread_only') === 'true')).toBe(true) // only the cheap count
  })
})

describe('Notifications page details', () => {
  it('opens the details of one notification, marks it read, and offers to open the record', async () => {
    const seen = spy()
    setup(manager, [note()], [http.post(`${BASE}/notifications/n-1/read`, async ({ request }) => { await seen.record(request); return HttpResponse.json(note({ read_at: 'x' })) })])
    renderApp('/notifications')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Task assigned' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Task assigned' }))
    expect(dialog.getByText('You were given “Calibrate press line 3”.')).toBeInTheDocument()
    expect(dialog.getByRole('link', { name: 'Open the task' })).toHaveAttribute('href', `/tasks/${TASK_ID}`)
    await waitFor(() => expect(seen.seen).toHaveLength(1))
  })

  it('shows the other simple facts, and says so when there is nothing more', async () => {
    setup(manager, [note({ payload: { priority: 'high', count: 2 } }), note({ id: 'n-2', payload: null })])
    renderApp('/notifications?open=n-1')
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Priority')).toBeInTheDocument()
    expect(dialog.getByText('high')).toBeInTheDocument()
    expect(dialog.queryByRole('link')).not.toBeInTheDocument() // no entity named -> no link
  })

  it('an employee is never pointed at a person page', async () => {
    setup(employee, [note({ recipient_user_id: employee.id, payload: { entity_type: 'user', entity_id: TASK_ID } })], [http.post(`${BASE}/notifications/n-1/read`, () => HttpResponse.json(note({ read_at: 'x' })))])
    renderApp('/notifications?open=n-1')
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.queryByRole('link')).not.toBeInTheDocument()
  })

  it('stays open after reading it removes it from the Unread view', async () => {
    const notes = [note()]
    setup(manager, notes, [http.post(`${BASE}/notifications/n-1/read`, () => { notes[0] = note({ read_at: 'x' }); return HttpResponse.json(notes[0]) })])
    renderApp('/notifications?view=unread&open=n-1')
    const dialog = await screen.findByRole('dialog', { name: 'Task assigned' })
    await waitFor(() => expect(screen.queryByText('You are all caught up')).toBeInTheDocument())
    expect(dialog).toBeInTheDocument()
  })

  it('marks EACH notification read as it is opened, one after another on the same page', async () => {
    const seen = spy()
    setup(manager, [note(), note({ id: 'n-2', type: 'leave_decision', payload: { message: 'Approved.' } })], [
      http.post(`${BASE}/notifications/:id/read`, async ({ request, params }) => { await seen.record(request); return HttpResponse.json(note({ id: String(params.id), read_at: 'x' })) }),
    ])
    renderApp('/notifications')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^Task assigned$/ }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: /^Leave decision$/ }))
    await waitFor(() => expect(seen.seen).toHaveLength(2))
    expect(seen.seen.map((s) => s.url.pathname.split('/').at(-2))).toEqual(['n-1', 'n-2'])
  })

  it('a stale ?open id that is not in the list opens nothing', async () => {
    setup(manager, [note()])
    renderApp('/notifications?open=nope')
    expect(await screen.findByRole('button', { name: 'Task assigned' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /./ })).not.toBeInTheDocument()
  })

  it('shows the total in words', async () => {
    setup(manager, [note(), note({ id: 'n-2' })])
    renderApp('/notifications')
    expect(await screen.findByText('2 notifications, newest first.')).toBeInTheDocument()
  })
})
