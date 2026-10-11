import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, employee, manager, mockSession, owner } from '@/test/api'
import { call, day, leave, list, person, spy, task } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const erin = person()
const mgr = person({ id: manager.id, name: manager.name, role: 'manager', manager_id: owner.id })
const project = (over = {}) => ({
  id: 'p-1', name: 'Plant upgrade', description: null, owning_manager_id: manager.id, status: 'in_progress',
  start_date: null, expected_end_date: null, actual_end_date: null, is_active: true, created_at: '', updated_at: '', ...over,
})

function setup(extra: Parameters<typeof server.use> = []) {
  mockSession(owner)
  server.use(
    ...extra,
    http.get(`${BASE}/users`, () => HttpResponse.json(list([erin, mgr]))),
    http.get(`${BASE}/users/directory`, ({ request }) => {
      const ids = new URL(request.url).searchParams.getAll('ids')
      return HttpResponse.json([erin, mgr, person({ id: owner.id, name: owner.name, role: 'owner' })].filter((p) => ids.includes(p.id)))
    }),
  )
}

describe('Owner navigation', () => {
  it('shows the company menu including administration, and no personal punch/leave screens', async () => {
    setup()
    renderApp('/dashboard')
    const nav = within(await screen.findByRole('navigation', { name: 'Main menu' }))
    for (const name of ['Company overview', 'Company tasks', 'Attendance', 'Leave requests', 'EOD reports', 'Projects', 'Service calls', 'Customers', 'Machines', 'Team calendar', 'Reports', 'Users & hierarchy', 'Permissions', 'Audit trail']) {
      expect(nav.getByRole('link', { name })).toBeInTheDocument()
    }
  })
})

describe('Company overview (Owner dashboard)', () => {
  it('shows company counts from the API and what needs the owner\'s attention', async () => {
    setup([
      http.get(`${BASE}/users`, ({ request }) => {
        const q = new URL(request.url).searchParams
        return HttpResponse.json(list([], { total: q.get('role') === 'manager' ? 2 : 9 }))
      }),
      http.get(`${BASE}/reports/tasks`, () => HttpResponse.json({ by_status: [{ status: 'in_progress', count: 4 }, { status: 'blocked', count: 1 }, { status: 'completed', count: 7 }], total: 12 })),
      http.get(`${BASE}/reports/service-activity`, () => HttpResponse.json({ by_status: [{ status: 'assigned', count: 3 }, { status: 'closed', count: 9 }], total_calls: 12, average_resolution_minutes: null })),
      http.get(`${BASE}/reports/workload`, () => HttpResponse.json([{ user_id: employee.id, open_task_count: 5, active_service_assignment_count: 0 }])),
      http.get(`${BASE}/leaves`, () => HttpResponse.json(list([leave()], { total: 4 }))),
      http.get(`${BASE}/attendance`, () => HttpResponse.json(list([day()], { total: 6 }))),
      http.get(`${BASE}/permissions/grants`, () => HttpResponse.json([{ id: 'g-1' }, { id: 'g-2' }])),
      http.get(`${BASE}/audit-logs`, () => HttpResponse.json(list([{ id: 'a-1', actor_user_id: owner.id, action: 'permission.granted', entity_type: 'permission_grant', entity_id: 'g-1', old_value: null, new_value: null, created_at: '2026-03-05T05:00:00Z' }]))),
      http.get(`${BASE}/tasks`, () => HttpResponse.json(list([task({ id: 't-b', title: 'Fix coolant leak', status: 'blocked' })]))),
      http.get(`${BASE}/users/directory`, ({ request }) => {
        const ids = new URL(request.url).searchParams.getAll('ids')
        return HttpResponse.json([erin, mgr, person({ id: owner.id, name: owner.name, role: 'owner' })].filter((p) => ids.includes(p.id)))
      }),
    ])
    renderApp('/dashboard')
    expect(await screen.findByRole('heading', { level: 1, name: /Hello, Olivia/ })).toBeInTheDocument()
    const tile = (label: string) => screen.getByText(label, { selector: '.stat-label' }).closest('a')!
    await waitFor(() => expect(within(tile('Active people')).getByText('9')).toBeInTheDocument())
    expect(within(tile('Managers')).getByText('2')).toBeInTheDocument()
    expect(within(tile('Open tasks')).getByText('5')).toBeInTheDocument() // in progress 4 + blocked 1
    expect(within(tile('Blocked tasks')).getByText('1')).toBeInTheDocument()
    expect(within(tile('Leave requests pending')).getByText('4')).toBeInTheDocument()
    expect(within(tile('Punched in today')).getByText('6 / 9')).toBeInTheDocument()
    expect(within(tile('Active service calls')).getByText('3')).toBeInTheDocument()
    expect(within(tile('Extra permissions in force')).getByText('2')).toBeInTheDocument()
    expect(tile('Extra permissions in force')).toHaveAttribute('href', '/permissions')
    expect(await screen.findByRole('link', { name: 'Fix coolant leak' })).toBeInTheDocument()
    expect(await screen.findByText('Permission granted')).toBeInTheDocument()
    expect(await screen.findByText(/waiting on Manny Manager/)).toBeInTheDocument()
  })
})

describe('Company-wide screens for the Owner', () => {
  it('leave: can decide any pending request (not only ones addressed to the owner), cannot apply for leave', async () => {
    const seen = spy()
    setup([
      http.get(`${BASE}/leaves`, () => HttpResponse.json(list([leave({ current_approver_id: manager.id })]))),
      http.post(`${BASE}/leaves/l-1/approve`, async ({ request }) => { await seen.record(request); return HttpResponse.json(leave({ status: 'approved' })) }),
    ])
    renderApp('/leaves')
    expect(await screen.findByRole('heading', { level: 1, name: 'Leave' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply for leave' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'My leave' })).not.toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Approve leave for Erin Employee' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve request' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
  })

  it('EOD: everyone\'s reports, no personal submit button or "My reports"', async () => {
    setup([http.get(`${BASE}/eod`, () => HttpResponse.json(list([{ id: 'e-1', user_id: employee.id, report_date: '2026-03-05', project_id: null, task_id: null, work_completed: 'Done', work_remaining: null, issues: null, notes: null, submitted_at: '2026-03-05T12:00:00Z' }])))])
    renderApp('/eod')
    expect(await screen.findByRole('row', { name: /Erin Employee/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Submit my report/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'My reports' })).not.toBeInTheDocument()
  })

  it('attendance: company-wide, with no personal punch card', async () => {
    setup([http.get(`${BASE}/attendance`, () => HttpResponse.json(list([day()])))])
    renderApp('/attendance')
    expect(await screen.findByRole('row', { name: /Erin Employee/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'My attendance' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Punch in' })).not.toBeInTheDocument()
  })

  it('tasks: can assign to anyone active', async () => {
    setup([http.get(`${BASE}/tasks`, () => HttpResponse.json(list([])))])
    renderApp('/tasks')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Assign a task' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(await dialog.findByRole('option', { name: /Erin Employee/ })).toBeInTheDocument()
    expect(dialog.getByRole('option', { name: /Manny Manager/ })).toBeInTheDocument()
  })

  it('projects: can create, filter by manager, and see archived ones marked as archived', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/projects`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([project(), project({ id: 'p-2', name: 'Old line', is_active: false })])) })])
    renderApp('/projects')
    expect(await screen.findByRole('button', { name: 'New project' })).toBeInTheDocument()
    const row = within(await screen.findByRole('row', { name: /Old line/ }))
    expect(row.getByText('Archived')).toBeInTheDocument()
    await screen.findByRole('option', { name: /Manny Manager/ })
    await userEvent.setup().selectOptions(screen.getByLabelText('Managed by'), manager.id)
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('manager_id')).toBe(manager.id))
  })

  it('project detail: the owner can edit, archive and manage members of any project', async () => {
    setup([
      http.get(`${BASE}/projects/p-1`, () => HttpResponse.json(project())),
      http.get(`${BASE}/projects/p-1/members`, () => HttpResponse.json([])),
      http.get(`${BASE}/permissions/me`, () => HttpResponse.json({ role: 'owner', unrestricted: true, role_defaults: [], grants: [] })),
    ])
    renderApp('/projects/p-1')
    expect(await screen.findByRole('button', { name: 'Edit project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add person' })).toBeInTheDocument()
  })

  it('project detail: an archived project can be restored', async () => {
    const seen = spy()
    setup([
      http.get(`${BASE}/projects/p-1`, () => HttpResponse.json(project({ is_active: false }))),
      http.get(`${BASE}/projects/p-1/members`, () => HttpResponse.json([])),
      http.patch(`${BASE}/projects/p-1`, async ({ request }) => { await seen.record(request); return HttpResponse.json(project()) }),
    ])
    renderApp('/projects/p-1')
    expect(await screen.findByText('Archived', { selector: '.badge' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ is_active: true }))
  })

  it('service call: the owner can assign anyone, change status, record visits and review reports', async () => {
    setup([
      http.get(`${BASE}/service-calls/c-1`, () => HttpResponse.json(call())),
      http.get(`${BASE}/service-calls/c-1/assignments`, () => HttpResponse.json([])),
      http.get(`${BASE}/service-calls/c-1/visits`, () => HttpResponse.json([])),
      http.get(`${BASE}/service-calls/c-1/reports`, () => HttpResponse.json([{ id: 'r-1', service_call_id: 'c-1', service_visit_id: null, employee_id: employee.id, report_datetime: '2026-03-05T08:00:00Z', service_type: 'field_visit', work_performed: 'Done', problem_found: null, root_cause: null, action_taken: null, parts_used: null, result: 'Fixed', pending_work: null, recommendations: null, employee_comments: null, reviewed_by: null, reviewed_at: null, submitted_at: '2026-03-05T09:00:00Z' }])),
      http.get(`${BASE}/customers/cust-1`, () => HttpResponse.json({ id: 'cust-1', customer_code: 'CU-7', name: 'Acme Forgings', address: null, notes: null, is_active: true, created_at: '', updated_at: '' })),
      http.get(`${BASE}/customers/cust-1/contacts`, () => HttpResponse.json([])),
      http.get(`${BASE}/machines/mach-1`, () => HttpResponse.json({ id: 'mach-1', machine_code: 'MC-88', customer_id: 'cust-1', model_name: null, serial_number: null, installation_date: null, purchase_info: null, warranty_info: null, location: null, status: 'active', is_active: true, created_at: '', updated_at: '' })),
    ])
    renderApp('/service/c-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Call SC-1042' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Assign someone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save status' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record a visit' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit report' })).not.toBeInTheDocument()
  })
})

describe('Reports (Owner)', () => {
  const setupReports = (extra: Parameters<typeof server.use> = []) =>
    setup([
      ...extra, // overrides first: MSW uses the first handler that matches
      http.get(`${BASE}/reports/attendance`, () => HttpResponse.json([{ user_id: employee.id, days_present: 5, total_minutes: 2400 }, { user_id: manager.id, days_present: 7, total_minutes: 3000 }])),
      http.get(`${BASE}/reports/tasks`, () => HttpResponse.json({ by_status: [{ status: 'completed', count: 3 }, { status: 'blocked', count: 1 }], total: 4 })),
      http.get(`${BASE}/reports/leave`, () => HttpResponse.json({ by_status: [{ status: 'approved', count: 2 }], total: 2 })),
      http.get(`${BASE}/reports/workload`, () => HttpResponse.json([{ user_id: employee.id, open_task_count: 2, active_service_assignment_count: 1 }])),
      http.get(`${BASE}/reports/service-activity`, () => HttpResponse.json({ by_status: [{ status: 'closed', count: 4 }], total_calls: 4, average_resolution_minutes: 150 })),
    ])

  it('shows attendance per person, status breakdowns, workload and service activity', async () => {
    setupReports()
    renderApp('/reports')
    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument()
    const attendance = within(await screen.findByRole('table', { name: 'Attendance per person' }))
    const first = attendance.getAllByRole('row')[1]!
    // the chart above the table carries the same numbers
    expect(screen.getByRole('figure', { name: 'Days present per person' })).toBeInTheDocument()
    expect(await within(first).findByText('Manny Manager')).toBeInTheDocument() // most days present first
    expect(within(first).getByText('7')).toBeInTheDocument()
    expect(within(first).getByText('50h 00m')).toBeInTheDocument() // 3000 min
    expect(attendance.getAllByText('8h 00m').length).toBeGreaterThan(0) // Erin: 2400 / 5 days = 480 min average
    const tasks = within(await screen.findByRole('figure', { name: 'Tasks by status' }))
    expect(tasks.getByText('Completed', { selector: '.hbar-label' })).toBeInTheDocument()
    expect(tasks.getByText('3', { selector: '.hbar-value' })).toBeInTheDocument()
    expect(screen.getByText(/average time to resolve about 2h 30m/)).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Open work per person' })).getByText('2')).toBeInTheDocument()
  })

  it('sends the date range and manager filter to the attendance and service reports', async () => {
    const att = spy()
    const svc = spy()
    setupReports([
      http.get(`${BASE}/reports/attendance`, async ({ request }) => { await att.record(request); return HttpResponse.json([]) }),
      http.get(`${BASE}/reports/service-activity`, async ({ request }) => { await svc.record(request); return HttpResponse.json({ by_status: [], total_calls: 0, average_resolution_minutes: null }) }),
    ])
    renderApp('/reports')
    expect(await screen.findByText('No attendance in this period')).toBeInTheDocument()
    expect(att.seen[0]?.url.searchParams.get('start_date')).toBe('2026-02-04') // 30 days ending on 2026-03-05
    expect(att.seen[0]?.url.searchParams.get('end_date')).toBe('2026-03-05')
    await screen.findByRole('option', { name: /Manny Manager/ })
    await userEvent.setup().selectOptions(screen.getByLabelText('Manager'), manager.id)
    await waitFor(() => expect(att.seen.at(-1)?.url.searchParams.get('manager_id')).toBe(manager.id))
    await waitFor(() => expect(svc.seen.at(-1)?.url.searchParams.get('manager_id')).toBe(manager.id))
  })

  it('managers get the same reports, scoped by the API', async () => {
    setupReports()
    mockSession(manager)
    renderApp('/reports')
    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument()
    expect(screen.getByText(/Figures for your team/)).toBeInTheDocument()
  })
})
