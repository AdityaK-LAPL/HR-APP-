import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, manager, mockSession } from '@/test/api'
import { list, person, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const entries = [
  { entry_date: '2026-03-05', entry_type: 'task', user_id: employee.id, title: 'Calibrate press line 3', status: 'in_progress', project_id: null },
  { entry_date: '2026-03-05', entry_type: 'leave', user_id: 'e-2', title: 'Leave (approved)', status: 'approved' },
  { entry_date: '2026-03-12', entry_type: 'task', user_id: manager.id, title: 'Review plan', status: 'not_started', project_id: null },
]

function setup(extra: Parameters<typeof server.use> = []) {
  mockSession(manager)
  server.use(
    ...extra,
    http.get(`${BASE}/users`, () => HttpResponse.json(list([person(), person({ id: 'e-2', name: 'Eli Engineer' })]))),
    http.get(`${BASE}/users/e-2`, () => HttpResponse.json(person({ id: 'e-2', name: 'Eli Engineer' }))),
    http.get(`${BASE}/users/directory`, ({ request }) => {
      const ids = new URL(request.url).searchParams.getAll('ids')
      const all = [person(), person({ id: 'e-2', name: 'Eli Engineer' }), person({ id: manager.id, name: manager.name })]
      return HttpResponse.json(all.filter((p) => ids.includes(p.id)))
    }),
    http.get(`${BASE}/calendar`, () => HttpResponse.json({ items: entries })),
  )
}

describe('Team calendar', () => {
  it('asks for the whole current month in company time', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/calendar`, async ({ request }) => { await seen.record(request); return HttpResponse.json({ items: [] }) })])
    renderApp('/calendar')
    expect(await screen.findByRole('heading', { level: 2, name: 'March 2026' })).toBeInTheDocument()
    await waitFor(() => expect(seen.seen).not.toHaveLength(0))
    const q = seen.seen[0]?.url.searchParams
    expect(q?.get('start_date')).toBe('2026-03-01')
    expect(q?.get('end_date')).toBe('2026-03-31')
  })

  it('puts tasks and leave on their days, with people\'s names', async () => {
    setup()
    renderApp('/calendar')
    const grid = within(await screen.findByRole('table'))
    expect(await grid.findByText('Erin Employee · Calibrate press line 3')).toBeInTheDocument()
    expect(grid.getByText('Eli Engineer · leave')).toBeInTheDocument()
    expect(grid.getByText('You · Review plan')).toBeInTheDocument()
  })

  it('moves between months and returns to this month', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/calendar`, async ({ request }) => { await seen.record(request); return HttpResponse.json({ items: [] }) })])
    renderApp('/calendar')
    const user = userEvent.setup()
    await screen.findByRole('heading', { level: 2, name: 'March 2026' })
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'April 2026' })).toBeInTheDocument()
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('start_date')).toBe('2026-04-01'))
    expect(seen.seen.at(-1)?.url.searchParams.get('end_date')).toBe('2026-04-30')
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'February 2026' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'This month' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'March 2026' })).toBeInTheDocument()
  })

  it('filters by person, project and "my direct reports"', async () => {
    const seen = spy()
    setup([
      http.get(`${BASE}/calendar`, async ({ request }) => { await seen.record(request); return HttpResponse.json({ items: [] }) }),
      http.get(`${BASE}/projects`, () => HttpResponse.json(list([{ id: 'p-1', name: 'Plant upgrade', description: null, owning_manager_id: manager.id, status: 'in_progress', start_date: null, expected_end_date: null, actual_end_date: null, is_active: true, created_at: '', updated_at: '' }]))),
    ])
    renderApp('/calendar')
    const user = userEvent.setup()
    await screen.findByRole('option', { name: /Erin Employee/ })
    await user.selectOptions(screen.getByLabelText('Person'), employee.id)
    await user.selectOptions(await screen.findByLabelText('Project'), 'p-1')
    await user.selectOptions(screen.getByLabelText('Team'), 'direct')
    await waitFor(() => {
      const q = seen.seen.at(-1)?.url.searchParams
      expect(q?.get('user_id')).toBe(employee.id)
      expect(q?.get('project_id')).toBe('p-1')
      expect(q?.get('team')).toBe(manager.id)
    })
  })

  it('opens a day to read every entry', async () => {
    setup()
    renderApp('/calendar')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Show all 2 entries on 05 Mar 2026' }))
    const dialog = within(await screen.findByRole('dialog', { name: '05 Mar 2026' }))
    expect(dialog.getByText(/Calibrate press line 3/)).toBeInTheDocument()
    expect(dialog.getByText(/Approved/)).toBeInTheDocument()
  })

  it('shows an agenda list (no grid) on a phone', async () => {
    window.innerWidth = 390
    setup()
    renderApp('/calendar')
    expect(await screen.findByRole('list', { name: 'Entries in March 2026' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('explains an empty month', async () => {
    setup([http.get(`${BASE}/calendar`, () => HttpResponse.json({ items: [] }))])
    renderApp('/calendar')
    expect(await screen.findByText('Nothing scheduled in March 2026')).toBeInTheDocument()
  })

  it('shows an error state when the calendar cannot be read', async () => {
    setup([http.get(`${BASE}/calendar`, () => apiError(403, 'forbidden', 'nope'))])
    renderApp('/calendar')
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
  })
})

describe('Calendar views', () => {
  const leaveEntry = { entry_date: '2026-03-04', entry_type: 'leave', user_id: 'e-2', title: 'Leave (approved)', status: 'approved' }
  const approvedLeave = { id: 'l-1', employee_id: 'e-2', start_date: '2026-03-04', end_date: '2026-03-06', reason: null, status: 'approved', current_approver_id: null, created_at: '', updated_at: '' }

  function setupViews(extra: Parameters<typeof server.use> = []) {
    setup([
      ...extra,
      http.get(`${BASE}/calendar`, () => HttpResponse.json({ items: [leaveEntry, entries[0]!] })),
      http.get(`${BASE}/leaves`, ({ request }) => HttpResponse.json(list(new URL(request.url).searchParams.get('status') === 'approved' ? [approvedLeave] : []))),
    ])
  }

  it('shows a multi-day leave on every day it covers (the API reports only its first day)', async () => {
    setupViews()
    renderApp('/calendar')
    const grid = within(await screen.findByRole('table'))
    await waitFor(() => expect(grid.getAllByText('Eli Engineer · leave')).toHaveLength(3)) // 4, 5 and 6 March
  })

  it('keeps a leave it cannot match to a request on its first day only', async () => {
    setup([http.get(`${BASE}/calendar`, () => HttpResponse.json({ items: [leaveEntry] })), http.get(`${BASE}/leaves`, () => HttpResponse.json(list([])))])
    renderApp('/calendar')
    const grid = within(await screen.findByRole('table'))
    await grid.findByText('Eli Engineer · leave')
    expect(grid.getAllByText('Eli Engineer · leave')).toHaveLength(1)
  })

  it('can show tasks only or leave only', async () => {
    setupViews()
    renderApp('/calendar')
    const user = userEvent.setup()
    const grid = within(await screen.findByRole('table'))
    await grid.findByText('Erin Employee · Calibrate press line 3')
    await user.click(screen.getByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(grid.queryByText('Erin Employee · Calibrate press line 3')).not.toBeInTheDocument())
    expect(grid.getAllByText('Eli Engineer · leave').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Tasks' }))
    await waitFor(() => expect(grid.queryByText('Eli Engineer · leave')).not.toBeInTheDocument())
    expect(grid.getByText('Erin Employee · Calibrate press line 3')).toBeInTheDocument()
  })

  it('has a week view with its own navigation, asking the API for exactly that week', async () => {
    const seen = spy()
    setupViews([http.get(`${BASE}/calendar`, async ({ request }) => { await seen.record(request); return HttpResponse.json({ items: [] }) })])
    renderApp('/calendar')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Week' }))
    // 5 March 2026 is a Thursday: the week is Monday 2 - Sunday 8 March
    await waitFor(() => {
      const q = seen.seen.at(-1)?.url.searchParams
      expect(q?.get('start_date')).toBe('2026-03-02')
      expect(q?.get('end_date')).toBe('2026-03-08')
    })
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('start_date')).toBe('2026-03-09'))
    expect(await screen.findByRole('heading', { level: 2, name: '09 Mar 2026 – 15 Mar 2026' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'This week' }))
    expect(await screen.findByRole('heading', { level: 2, name: '02 Mar 2026 – 08 Mar 2026' })).toBeInTheDocument()
  })

  it('has a list view that groups entries by day', async () => {
    setupViews()
    renderApp('/calendar?view=list')
    const list_ = await screen.findByRole('list', { name: 'Entries in March 2026' })
    expect(within(list_).getByText('05 Mar 2026 · today')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('gives an employee their own calendar, without people or team filters', async () => {
    mockSession(employee)
    server.use(http.get(`${BASE}/calendar`, () => HttpResponse.json({ items: [entries[0]!] })), http.get(`${BASE}/leaves`, () => HttpResponse.json(list([]))))
    renderApp('/calendar')
    expect(await screen.findByRole('heading', { level: 1, name: 'My calendar' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Person')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Team')).not.toBeInTheDocument()
  })
})
