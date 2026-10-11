import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, employee, manager, mockSession, owner } from '@/test/api'
import { day, leave, list, person, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const erin = person()
const eli = person({ id: 'e-2', name: 'Eli Engineer', employee_code: 'EMP002' })
const mgr = person({ id: manager.id, name: manager.name, role: 'manager', employee_code: 'MGR001' })
const ownerPerson = person({ id: owner.id, name: owner.name, role: 'owner', employee_code: 'OWN001' })
const project = (over = {}) => ({ id: 'p-1', name: 'Plant upgrade', description: null, owning_manager_id: manager.id, status: 'in_progress', start_date: null, expected_end_date: null, actual_end_date: null, is_active: true, created_at: '', updated_at: '', ...over })

function setup(who = owner, extra: Parameters<typeof server.use> = []) {
  mockSession(who)
  server.use(
    ...extra,
    http.get(`${BASE}/users`, () => HttpResponse.json(list([ownerPerson, mgr, erin, eli]))),
    http.get(`${BASE}/users/directory`, ({ request }) => {
      const ids = new URL(request.url).searchParams.getAll('ids')
      return HttpResponse.json([ownerPerson, mgr, erin, eli].filter((p) => ids.includes(p.id)))
    }),
  )
}

describe('Reports: the daily check', () => {
  it('lists who has not punched in or submitted an EOD report, leaving out the owner and noting leave', async () => {
    setup(owner, [
      http.get(`${BASE}/attendance`, () => HttpResponse.json(list([day({ user_id: erin.id })]))),
      http.get(`${BASE}/eod`, () => HttpResponse.json(list([{ id: 'e-1', user_id: mgr.id, report_date: '2026-03-05', project_id: null, task_id: null, work_completed: 'x', work_remaining: null, issues: null, notes: null, submitted_at: '' }]))),
      http.get(`${BASE}/leaves`, () => HttpResponse.json(list([leave({ employee_id: eli.id, status: 'approved', start_date: '2026-03-04', end_date: '2026-03-06', current_approver_id: null })]))),
    ])
    renderApp('/reports')
    const noPunch = await screen.findByRole('heading', { name: /Not punched in \(2\)/ })
    const column = within(noPunch.parentElement!)
    expect(column.getByRole('link', { name: 'Manny Manager' })).toBeInTheDocument()
    expect(column.getByRole('link', { name: 'Eli Engineer' })).toBeInTheDocument()
    expect(column.queryByRole('link', { name: 'Erin Employee' })).not.toBeInTheDocument() // punched in
    expect(column.queryByRole('link', { name: 'Olivia Owner' })).not.toBeInTheDocument() // the owner does not punch
    await waitFor(() => expect(column.getByText('On leave')).toBeInTheDocument()) // Eli's approved leave covers today
    const noEod = within((await screen.findByRole('heading', { name: /No end-of-day report \(2\)/ })).parentElement!)
    expect(noEod.getByRole('link', { name: 'Erin Employee' })).toBeInTheDocument()
    expect(noEod.queryByRole('link', { name: 'Manny Manager' })).not.toBeInTheDocument() // submitted
  })

  it('checks any chosen day with the API\'s exact-date filters', async () => {
    const att = spy()
    const eod = spy()
    setup(owner, [
      http.get(`${BASE}/attendance`, async ({ request }) => { await att.record(request); return HttpResponse.json(list([])) }),
      http.get(`${BASE}/eod`, async ({ request }) => { await eod.record(request); return HttpResponse.json(list([])) }),
    ])
    renderApp('/reports?day=2026-03-02')
    await screen.findByRole('heading', { name: /Daily check · 02 Mar 2026/ })
    await waitFor(() => expect(att.seen.some((s) => s.url.searchParams.get('start_date') === '2026-03-02' && s.url.searchParams.get('end_date') === '2026-03-02')).toBe(true))
    await waitFor(() => expect(eod.seen.some((s) => s.url.searchParams.get('report_date') === '2026-03-02')).toBe(true))
  })

  it('warns when a list may be longer than it can read', async () => {
    setup(owner, [http.get(`${BASE}/attendance`, () => HttpResponse.json(list([], { total: 250 })))])
    renderApp('/reports')
    expect(await screen.findByText(/may be incomplete/)).toBeInTheDocument()
  })
})

describe('Reports: periods and tables', () => {
  const rowsData = [{ user_id: erin.id, days_present: 5, total_minutes: 2400 }, { user_id: eli.id, days_present: 9, total_minutes: 4000 }]

  it('offers quick periods that drive the attendance request', async () => {
    const att = spy()
    setup(owner, [http.get(`${BASE}/reports/attendance`, async ({ request }) => { await att.record(request); return HttpResponse.json([]) })])
    renderApp('/reports')
    const user = userEvent.setup()
    await screen.findByText('No attendance in this period')
    expect(att.seen.at(-1)?.url.searchParams.get('start_date')).toBe('2026-02-04') // last 30 days (the default)
    await user.click(screen.getByRole('button', { name: 'Last 7 days' }))
    await waitFor(() => expect(att.seen.at(-1)?.url.searchParams.get('start_date')).toBe('2026-02-27'))
    await user.click(screen.getByRole('button', { name: 'This month' }))
    await waitFor(() => expect(att.seen.at(-1)?.url.searchParams.get('start_date')).toBe('2026-03-01'))
    await user.click(screen.getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(att.seen.at(-1)?.url.searchParams.get('start_date')).toBe('2026-03-05'))
    expect(att.seen.at(-1)?.url.searchParams.get('end_date')).toBe('2026-03-05')
  })

  it('takes a custom range', async () => {
    const att = spy()
    setup(owner, [http.get(`${BASE}/reports/attendance`, async ({ request }) => { await att.record(request); return HttpResponse.json([]) })])
    renderApp('/reports?range=custom&from=2026-02-10&to=2026-02-20')
    await screen.findByText('No attendance in this period')
    expect(att.seen.at(-1)?.url.searchParams.get('start_date')).toBe('2026-02-10')
    expect(att.seen.at(-1)?.url.searchParams.get('end_date')).toBe('2026-02-20')
  })

  it('sorts the attendance table by any column', async () => {
    setup(owner, [http.get(`${BASE}/reports/attendance`, () => HttpResponse.json(rowsData))])
    renderApp('/reports')
    const table = within(await screen.findByRole('table', { name: 'Attendance per person' }))
    const names = () => table.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0]?.textContent)
    await waitFor(() => expect(names()).toEqual(['Eli Engineer', 'Erin Employee'])) // most days first
    await userEvent.setup().click(table.getByRole('button', { name: 'Person' }))
    expect(names()).toEqual(['Eli Engineer', 'Erin Employee']) // A-Z
    await userEvent.setup().click(table.getByRole('button', { name: 'Person' }))
    expect(names()).toEqual(['Erin Employee', 'Eli Engineer']) // Z-A
  })

  it('has a project report: counts by status and task progress per project', async () => {
    setup(owner, [
      http.get(`${BASE}/projects`, ({ request }) => {
        const q = new URL(request.url).searchParams
        const status = q.get('status')
        if (status) return HttpResponse.json(list([], { total: status === 'in_progress' ? 3 : status === 'completed' ? 1 : 0 }))
        return HttpResponse.json(list([project(), project({ id: 'p-2', name: 'Old line', status: 'completed', is_active: false })], { total: 2 }))
      }),
      http.get(`${BASE}/reports/tasks`, ({ request }) => {
        const id = new URL(request.url).searchParams.get('project_id')
        if (id === 'p-1') return HttpResponse.json({ by_status: [{ status: 'completed', count: 3 }, { status: 'blocked', count: 1 }], total: 4 })
        if (id === 'p-2') return HttpResponse.json({ by_status: [], total: 0 })
        return HttpResponse.json({ by_status: [], total: 0 })
      }),
    ])
    renderApp('/reports')
    const chart = within(await screen.findByRole('figure', { name: 'Projects by status' }))
    expect(chart.getByText('In progress', { selector: '.hbar-label' })).toBeInTheDocument()
    expect(chart.getByText('3', { selector: '.hbar-value' })).toBeInTheDocument()
    const table = within(await screen.findByRole('table', { name: 'Task progress by project' }))
    const plant = within(await table.findByRole('row', { name: /Plant upgrade/ }))
    await waitFor(() => expect(plant.getByText('75%')).toBeInTheDocument())
    expect(within(table.getByRole('row', { name: /Old line/ })).getByText('Archived')).toBeInTheDocument()
    expect(within(table.getByRole('row', { name: /Old line/ })).getByText('—')).toBeInTheDocument() // no tasks: no percentage
  })

  it('a manager\'s manager filter lists only themself and their own managers', async () => {
    setup(manager, [http.get(`${BASE}/users/${manager.id}/subordinates`, () => HttpResponse.json([person({ id: 'm-sub', name: 'Sub Manager', role: 'manager' }), erin]))])
    renderApp('/reports')
    const filter = await screen.findByLabelText('Manager')
    await waitFor(() => expect(within(filter).getByRole('option', { name: /Sub Manager/ })).toBeInTheDocument())
    expect(within(filter).queryByRole('option', { name: /Erin Employee/ })).not.toBeInTheDocument()
    expect(within(filter).getByRole('option', { name: /Manny Manager \(you\)/ })).toBeInTheDocument()
    void employee
  })
})

describe('Dashboards: leave today and a task chart', () => {
  it('the manager dashboard shows who is on leave today and the task statuses as bars', async () => {
    setup(manager, [
      http.get(`${BASE}/users/${manager.id}/subordinates`, () => HttpResponse.json([erin, eli])),
      http.get(`${BASE}/leaves`, ({ request }) => HttpResponse.json(list(new URL(request.url).searchParams.get('status') === 'approved' ? [leave({ employee_id: eli.id, status: 'approved', start_date: '2026-03-04', end_date: '2026-03-06', current_approver_id: null })] : []))),
      http.get(`${BASE}/reports/tasks`, () => HttpResponse.json({ by_status: [{ status: 'in_progress', count: 4 }, { status: 'blocked', count: 1 }], total: 5 })),
    ])
    renderApp('/dashboard')
    const section = within((await screen.findByRole('heading', { name: 'On leave today' })).closest('section')!)
    expect(await section.findByRole('link', { name: 'Eli Engineer' })).toBeInTheDocument()
    expect(section.getByText(/back after 06 Mar 2026/)).toBeInTheDocument()
    const chart = within(await screen.findByRole('figure', { name: 'Tasks by status' }))
    expect(chart.getByText('4', { selector: '.hbar-value' })).toBeInTheDocument()
  })

  it('says so when nobody is on leave', async () => {
    setup(manager)
    renderApp('/dashboard')
    expect(await screen.findByText('Nobody is on approved leave today.')).toBeInTheDocument()
  })
})

describe('Attendance quick periods', () => {
  it('team attendance has presets that set the date range', async () => {
    const att = spy()
    setup(manager, [http.get(`${BASE}/attendance`, async ({ request }) => { await att.record(request); return HttpResponse.json(list([])) })])
    renderApp('/attendance')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Last 7 days' }))
    await waitFor(() => {
      const q = att.seen.at(-1)?.url.searchParams
      expect(q?.get('start_date')).toBe('2026-02-27')
      expect(q?.get('end_date')).toBe('2026-03-05')
    })
    expect(screen.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'true')
  })
})
