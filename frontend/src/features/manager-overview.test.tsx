import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, employee, manager, mockSession, owner } from '@/test/api'
import { day, leave, list, person, spy, task } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const erin = person()
const eod = (over = {}) => ({
  id: 'e-1', user_id: employee.id, report_date: '2026-03-05', project_id: null, task_id: null,
  work_completed: 'Finished the calibration.', work_remaining: null, issues: 'Sensor drift', notes: null,
  submitted_at: '2026-03-05T12:00:00Z', ...over,
})

function setup(extra: Parameters<typeof server.use> = []) {
  mockSession(manager)
  server.use(
    ...extra,
    http.get(`${BASE}/users/${manager.id}/subordinates`, () => HttpResponse.json([erin])),
    http.get(`${BASE}/users`, () => HttpResponse.json(list([erin]))),
  )
}

describe('Manager navigation', () => {
  it('shows the manager\'s own menu and nothing owner-only', async () => {
    setup()
    renderApp('/dashboard')
    const nav = within(await screen.findByRole('navigation', { name: 'Main menu' }))
    for (const name of ['Team overview', 'Team tasks', 'Team attendance', 'Leave approvals', 'EOD reports', 'Projects', 'Service calls', 'Customers', 'Machines', 'Team calendar', 'Reports', 'My team']) {
      expect(nav.getByRole('link', { name })).toBeInTheDocument()
    }
    for (const name of ['Permissions', 'Audit trail', 'Users & hierarchy']) {
      expect(nav.queryByRole('link', { name })).not.toBeInTheDocument()
    }
  })

  it('does not give employees the manager screens', async () => {
    mockSession(employee)
    renderApp('/reports')
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
  })

  it('does not give employees a person page', async () => {
    mockSession(employee)
    renderApp(`/users/${erin.id}`)
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
  })

  it('keeps the Owner\'s administration out of a manager\'s reach', async () => {
    setup()
    renderApp('/audit-logs')
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
  })
})

describe('Manager dashboard', () => {
  it('shows counts straight from the API and what needs attention', async () => {
    setup([
      http.get(`${BASE}/reports/tasks`, () => HttpResponse.json({ by_status: [{ status: 'not_started', count: 2 }, { status: 'in_progress', count: 3 }, { status: 'blocked', count: 1 }, { status: 'completed', count: 10 }], total: 16 })),
      http.get(`${BASE}/reports/service-activity`, () => HttpResponse.json({ by_status: [{ status: 'assigned', count: 2 }, { status: 'closed', count: 5 }, { status: 'in_progress', count: 1 }], total_calls: 8, average_resolution_minutes: null })),
      http.get(`${BASE}/reports/workload`, () => HttpResponse.json([{ user_id: employee.id, open_task_count: 4, active_service_assignment_count: 1 }])),
      http.get(`${BASE}/leaves`, () => HttpResponse.json(list([leave(), leave({ id: 'l-2', current_approver_id: owner.id })]))),
      http.get(`${BASE}/attendance`, () => HttpResponse.json(list([day()], { total: 1 }))),
      http.get(`${BASE}/tasks`, ({ request }) => {
        const status = new URL(request.url).searchParams.get('status')
        return HttpResponse.json(list(status === 'blocked' ? [task({ id: 't-b', title: 'Fix coolant leak', status: 'blocked' })] : []))
      }),
    ])
    renderApp('/dashboard')
    expect(await screen.findByRole('heading', { level: 1, name: /Hello, Manny/ })).toBeInTheDocument()
    const tile = (label: string) => screen.getByText(label, { selector: '.stat-label' }).closest('a')!
    await waitFor(() => expect(within(tile('Open team tasks')).getByText('6')).toBeInTheDocument()) // 2 + 3 + 1
    expect(within(tile('Blocked tasks')).getByText('1')).toBeInTheDocument()
    expect(within(tile('People in my team')).getByText('1')).toBeInTheDocument()
    expect(within(tile('Punched in today')).getByText('1 / 2')).toBeInTheDocument() // the team of 1 plus the manager
    expect(within(tile('Active service calls')).getByText('3')).toBeInTheDocument() // assigned 2 + in progress 1; closed excluded
    expect(tile('Open team tasks')).toHaveAttribute('href', '/tasks')
    // Only the request that is waiting on this manager is listed under "Waiting for your decision".
    const waiting = within(screen.getByRole('heading', { name: 'Waiting for your decision' }).closest('section')!)
    expect(await waiting.findByText('Erin Employee')).toBeInTheDocument()
    expect(waiting.getAllByRole('listitem')).toHaveLength(1)
    expect(await screen.findByRole('link', { name: 'Fix coolant leak' })).toBeInTheDocument()
    expect(await screen.findByText(/4 open tasks/)).toBeInTheDocument()
  })

  it('stays useful when there is nothing going on', async () => {
    setup()
    renderApp('/dashboard')
    expect(await screen.findByText('No leave requests are waiting for you.')).toBeInTheDocument()
    expect(await screen.findByText('Nothing is blocked.')).toBeInTheDocument()
    expect(await screen.findByText('No open tasks across the team.')).toBeInTheDocument()
  })
})

describe('EOD reports for a manager', () => {
  it('lists the team\'s reports with who wrote them and filters by person/project/date', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/eod`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([eod()])) })])
    renderApp('/eod')
    expect(await screen.findByRole('heading', { level: 1, name: 'EOD reports' })).toBeInTheDocument()
    const row = within(await screen.findByRole('row', { name: /Erin Employee/ }))
    expect(row.getByRole('link', { name: '05 Mar 2026' })).toHaveAttribute('href', '/eod/e-1')
    expect(row.getByText('Sensor drift')).toBeInTheDocument()
    const user = userEvent.setup()
    await screen.findByRole('option', { name: /Erin Employee/ })
    await user.selectOptions(screen.getByLabelText('Employee'), employee.id)
    await user.type(screen.getByLabelText('Report date'), '2026-03-05')
    await waitFor(() => {
      const q = seen.seen.at(-1)?.url.searchParams
      expect(q?.get('user_id')).toBe(employee.id)
      expect(q?.get('report_date')).toBe('2026-03-05')
    })
  })

  it('"My reports" shows only the manager\'s own and links to the submit form', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/eod`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([])) })])
    renderApp('/eod')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'My reports' }))
    expect(await screen.findByText('You have not submitted a report yet')).toBeInTheDocument()
    expect(seen.seen.at(-1)?.url.searchParams.get('user_id')).toBe(manager.id)
    expect(screen.getByRole('link', { name: /Submit my report/ })).toHaveAttribute('href', '/eod/new')
  })

  it('lets a manager submit their own report', async () => {
    const seen = spy()
    setup([
      http.post(`${BASE}/eod`, async ({ request }) => { await seen.record(request); return HttpResponse.json(eod({ id: 'e-9', user_id: manager.id }), { status: 201 }) }),
      http.get(`${BASE}/eod/e-9`, () => HttpResponse.json(eod({ id: 'e-9', user_id: manager.id }))),
    ])
    renderApp('/eod/new')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/work completed/i), 'Reviewed the plan')
    await user.click(screen.getByRole('button', { name: 'Submit report' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(await screen.findByRole('heading', { level: 1, name: /EOD report/ })).toBeInTheDocument()
  })

  it('a team report shows its author and offers no upload to the manager', async () => {
    setup([
      http.get(`${BASE}/eod/e-1`, () => HttpResponse.json(eod())),
      http.get(`${BASE}/attachments`, () => HttpResponse.json({ items: [] })),
    ])
    renderApp('/eod/e-1')
    expect(await screen.findByText(/Erin Employee · Submitted/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/add a file|upload/i)).not.toBeInTheDocument()
  })
})

describe('Team attendance', () => {
  it('opens on today and shows who punched in', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/attendance`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([day(), day({ id: 'a-2', user_id: manager.id, punch_out_time: '2026-03-05T12:30:00Z', total_duration_minutes: 540 })])) })])
    renderApp('/attendance')
    expect(await screen.findByRole('heading', { level: 1, name: 'Attendance' })).toBeInTheDocument()
    const table = within(await screen.findByRole('table'))
    expect(await table.findByText('Erin Employee')).toBeInTheDocument()
    expect(table.getByText('You')).toBeInTheDocument()
    expect(seen.seen[0]?.url.searchParams.get('start_date')).toBe('2026-03-05')
    expect(seen.seen[0]?.url.searchParams.get('end_date')).toBe('2026-03-05')
  })

  it('filters by person and date range', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/attendance`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([])) })])
    renderApp('/attendance')
    const user = userEvent.setup()
    await screen.findByRole('option', { name: /Erin Employee/ })
    await user.selectOptions(screen.getByLabelText('Employee'), employee.id)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-04' } })
    await waitFor(() => {
      const q = seen.seen.at(-1)?.url.searchParams
      expect(q?.get('user_id')).toBe(employee.id)
      expect(q?.get('start_date')).toBe('2026-03-01')
      expect(q?.get('end_date')).toBe('2026-03-04')
    })
  })

  it('explains an empty day', async () => {
    setup([http.get(`${BASE}/attendance`, () => HttpResponse.json(list([])))])
    renderApp('/attendance')
    expect(await screen.findByText('Nobody in your team has punched in yet today.')).toBeInTheDocument()
  })

  it('"My attendance" has the manager\'s own punch card', async () => {
    setup()
    renderApp('/attendance')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'My attendance' }))
    expect(await screen.findByRole('button', { name: 'Punch in' })).toBeInTheDocument()
  })
})
