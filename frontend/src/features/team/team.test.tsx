import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, manager, mockSession, owner } from '@/test/api'
import { list, person, spy, task } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const erin = person()
const eli = person({ id: 'e-2', name: 'Eli Engineer', employee_code: 'EMP002', is_active: false })
const peerManager = person({ id: 'm-2', name: 'Priya Peer', role: 'manager', manager_id: owner.id, employee_code: 'MGR002' })

function setup(extra: Parameters<typeof server.use> = []) {
  mockSession(manager)
  server.use(
    ...extra,
    http.get(`${BASE}/users/${manager.id}/subordinates`, () => HttpResponse.json([erin, eli])),
    http.get(`${BASE}/users`, () => HttpResponse.json(list([person({ id: manager.id, name: manager.name, role: 'manager', manager_id: owner.id }), erin]))),
    http.get(`${BASE}/users/${erin.id}`, () => HttpResponse.json(erin)),
    http.get(`${BASE}/reports/workload`, () => HttpResponse.json([{ user_id: erin.id, open_task_count: 4, active_service_assignment_count: 1 }])),
  )
}

describe('My team', () => {
  it('lists people with their role, status and workload, linking to each person', async () => {
    setup()
    renderApp('/users')
    expect(await screen.findByRole('heading', { level: 1, name: 'My team' })).toBeInTheDocument()
    const row = within(await screen.findByRole('row', { name: /Erin Employee/ }))
    expect(row.getByRole('link', { name: 'Erin Employee' })).toHaveAttribute('href', `/users/${erin.id}`)
    expect(row.getByText('4')).toBeInTheDocument() // open tasks from /reports/workload
    expect(row.getByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manny Manager (you)' })).toBeInTheDocument()
  })

  it('searches by name and filters by role/status through the API', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/users`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([])) })])
    renderApp('/users')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Search'), 'erin')
    await user.selectOptions(screen.getByLabelText('Role'), 'employee')
    await user.selectOptions(screen.getByLabelText('Status'), 'all')
    await waitFor(() => {
      const q = seen.seen.at(-1)?.url.searchParams
      expect(q?.get('search')).toBe('erin')
      expect(q?.get('role')).toBe('employee')
      expect(q?.get('is_active')).toBeNull()
    })
    expect(await screen.findByText('No one matches')).toBeInTheDocument()
  })

  it('asks only for active people by default', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/users`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([])) })])
    renderApp('/users')
    await screen.findByText('No one reports to you yet')
    expect(seen.seen[0]?.url.searchParams.get('is_active')).toBe('true')
  })

  it('shows the reporting structure as a tree built from the flat hierarchy', async () => {
    setup([
      http.get(`${BASE}/hierarchy`, () =>
        HttpResponse.json([
          { id: manager.id, employee_code: 'MGR001', name: manager.name, role: 'manager', manager_id: owner.id },
          { id: erin.id, employee_code: 'EMP001', name: erin.name, role: 'employee', manager_id: manager.id },
        ]),
      ),
    ])
    renderApp('/users?view=structure')
    const tree = within(await screen.findByRole('list', { name: 'Reporting structure' }))
    expect(tree.getByRole('link', { name: 'Manny Manager' })).toBeInTheDocument()
    const nested = within(tree.getAllByRole('list').at(-1)!)
    expect(nested.getByRole('link', { name: 'Erin Employee' })).toHaveAttribute('href', `/users/${erin.id}`)
  })
})

describe('A person in the team', () => {
  const detail = (extra: Parameters<typeof server.use> = []) =>
    setup([
      http.get(`${BASE}/tasks`, () => HttpResponse.json(list([task({ title: 'Calibrate press line 3' })]))),
      ...extra,
    ])

  it('shows the profile, manager name and recent work', async () => {
    detail()
    renderApp(`/users/${erin.id}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Erin Employee' })).toBeInTheDocument()
    expect(await screen.findByText('You', { selector: 'dd' })).toBeInTheDocument() // reports to me
    expect(await screen.findByRole('link', { name: 'Calibrate press line 3' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'View all' })[0]).toHaveAttribute('href', `/tasks?assignee=${erin.id}`)
  })

  it('offers assign / edit / reset for someone in my own team', async () => {
    detail()
    renderApp(`/users/${erin.id}`)
    expect(await screen.findByRole('button', { name: 'Assign a task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeInTheDocument()
  })

  it('is read-only for a peer manager seen through a visibility grant', async () => {
    setup([http.get(`${BASE}/users/m-2`, () => HttpResponse.json(peerManager))])
    renderApp('/users/m-2')
    expect(await screen.findByRole('heading', { level: 1, name: 'Priya Peer' })).toBeInTheDocument()
    expect(screen.getByText('View only (outside your own reporting line)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset password' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Assign a task' })).not.toBeInTheDocument()
  })

  it('shows "Not available" for someone outside the manager\'s reach (the API answers 404)', async () => {
    setup([http.get(`${BASE}/users/stranger`, () => apiError(404, 'not_found', 'User not found.'))])
    renderApp('/users/stranger')
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
  })

  it('edits only what changed', async () => {
    const seen = spy()
    detail([http.patch(`${BASE}/users/${erin.id}`, async ({ request }) => { await seen.record(request); return HttpResponse.json({ ...erin, designation: 'Senior Engineer' }) })])
    renderApp(`/users/${erin.id}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit profile' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit profile' }))
    const designation = dialog.getByLabelText('Designation')
    await user.clear(designation)
    await user.type(designation, 'Senior Engineer')
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ designation: 'Senior Engineer' }))
  })

  it('resets a password: needs 8+ characters, warns about sign-out, and sends the temporary password', async () => {
    const seen = spy()
    detail([http.post(`${BASE}/users/${erin.id}/reset-password`, async ({ request }) => { await seen.record(request); return new HttpResponse(null, { status: 204 }) })])
    renderApp(`/users/${erin.id}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Reset password' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText(/signed out everywhere/)).toBeInTheDocument()
    await user.type(dialog.getByLabelText(/temporary password/i), 'short')
    await user.click(dialog.getByRole('button', { name: 'Reset password' }))
    expect(await dialog.findByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(seen.seen).toHaveLength(0)
    await user.clear(dialog.getByLabelText(/temporary password/i))
    await user.type(dialog.getByLabelText(/temporary password/i), 'Temp#2026pass')
    await user.click(dialog.getByRole('button', { name: 'Reset password' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ temporary_password: 'Temp#2026pass' }))
    expect(await screen.findByText(/Temporary password set for Erin Employee/)).toBeInTheDocument()
  })

  it('still shows other sections when one of them fails', async () => {
    detail([http.get(`${BASE}/eod`, () => apiError(403, 'forbidden', 'nope'))])
    renderApp(`/users/${erin.id}`)
    expect(await screen.findByRole('link', { name: 'Calibrate press line 3' })).toBeInTheDocument()
    expect(await screen.findAllByText('Not available')).not.toHaveLength(0)
  })
})
