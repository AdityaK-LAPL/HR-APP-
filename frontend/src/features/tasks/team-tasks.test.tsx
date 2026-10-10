import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, manager, mockSession, owner } from '@/test/api'
import { list, person, spy, task } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const team = [person(), person({ id: 'e-2', name: 'Eli Engineer', employee_code: 'EMP002' })]
const project = {
  id: 'p-1', name: 'Plant upgrade', description: null, owning_manager_id: manager.id, status: 'in_progress',
  start_date: null, expected_end_date: null, actual_end_date: null, is_active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

function setup(extra: Parameters<typeof server.use> = []) {
  mockSession(manager)
  server.use(
    ...extra, // overrides first: MSW uses the first handler that matches
    http.get(`${BASE}/users/${manager.id}/subordinates`, () => HttpResponse.json(team)),
    http.get(`${BASE}/users`, () => HttpResponse.json(list([...team, person({ id: manager.id, name: manager.name, role: 'manager' })]))),
    http.get(`${BASE}/projects`, () => HttpResponse.json(list([project]))),
    http.get(`${BASE}/reports/tasks`, () =>
      HttpResponse.json({ by_status: [{ status: 'in_progress', count: 3 }, { status: 'blocked', count: 2 }, { status: 'completed', count: 9 }], total: 14 }),
    ),
  )
}

describe('Team tasks', () => {
  it('lists the team\'s tasks with who they are for, and summarises open and blocked work', async () => {
    setup([http.get(`${BASE}/tasks`, () => HttpResponse.json(list([task(), task({ id: 't-2', title: 'Replace filters', assigned_to: 'e-2' })])))])
    renderApp('/tasks')
    expect(await screen.findByRole('heading', { level: 1, name: 'Team tasks' })).toBeInTheDocument()
    const table = within(await screen.findByRole('table'))
    expect(await table.findByRole('link', { name: 'Calibrate press line 3' })).toHaveAttribute('href', '/tasks/t-1')
    expect(table.getByText('Replace filters')).toBeInTheDocument()
    expect(await screen.findByText('5', { selector: '.stat-value' })).toBeInTheDocument() // open = 3 in progress + 2 blocked
  })

  it('narrows by assignee, project and status through the API', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/tasks`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([])) })])
    renderApp('/tasks')
    const user = userEvent.setup()
    await screen.findByRole('option', { name: /Erin Employee/ }) // people load before they can be chosen
    await user.selectOptions(screen.getByLabelText('Assigned to'), employee.id)
    await user.selectOptions(screen.getByLabelText('Project'), 'p-1')
    await user.selectOptions(screen.getByLabelText('Status'), 'blocked')
    await waitFor(() => {
      const q = seen.seen.at(-1)?.url.searchParams
      expect(q?.get('assigned_to')).toBe(employee.id)
      expect(q?.get('project_id')).toBe('p-1')
      expect(q?.get('status')).toBe('blocked')
    })
    expect(await screen.findByText('No tasks match these filters')).toBeInTheDocument()
  })

  it('has an empty state that offers to assign the first task', async () => {
    setup([http.get(`${BASE}/tasks`, () => HttpResponse.json(list([])))])
    renderApp('/tasks')
    expect(await screen.findByText('No tasks yet')).toBeInTheDocument()
  })

  it('shows the neutral error with retry when the list fails', async () => {
    setup([http.get(`${BASE}/tasks`, () => apiError(500, 'internal_error', 'Boom (ref 1)'))])
    renderApp('/tasks')
    expect(await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 })).toBeInTheDocument()
  })

  it('assigns a task: people are me + my team, and the request carries exactly what was entered', async () => {
    const seen = spy()
    setup([
      http.get(`${BASE}/tasks`, () => HttpResponse.json(list([]))),
      http.post(`${BASE}/tasks`, async ({ request }) => { await seen.record(request); return HttpResponse.json(task({ id: 't-9' }), { status: 201 }) }),
    ])
    renderApp('/tasks')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Assign a task', hidden: false }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Assign a task' }))
    const options = await dialog.findAllByRole('option')
    const labels = options.map((o) => o.textContent)
    expect(labels).toEqual(expect.arrayContaining([expect.stringContaining('Manny Manager (you)'), expect.stringContaining('Erin Employee'), expect.stringContaining('Eli Engineer')]))

    await user.click(dialog.getByRole('button', { name: 'Assign task' }))
    expect(await dialog.findByText('Give the task a title.')).toBeInTheDocument()
    expect(dialog.getByText('Choose who this task is for.')).toBeInTheDocument()
    expect(seen.seen).toHaveLength(0)

    await user.type(dialog.getByLabelText(/^title/i), '  Inspect coolant pump ')
    await user.selectOptions(dialog.getByLabelText(/assign to/i), 'e-2')
    await user.selectOptions(dialog.getByLabelText('Project'), 'p-1')
    await user.selectOptions(dialog.getByLabelText('Priority'), 'urgent')
    await user.click(dialog.getByRole('button', { name: 'Assign task' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toEqual({
      title: 'Inspect coolant pump', description: null, assigned_to: 'e-2', project_id: 'p-1',
      priority: 'urgent', task_date: '2026-03-05', due_date: null,
    })
    expect(await screen.findByText('Task assigned.')).toBeInTheDocument()
  })

  it('refuses a due date before the task date in the form', async () => {
    setup([http.get(`${BASE}/tasks`, () => HttpResponse.json(list([])))])
    renderApp('/tasks')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Assign a task' }))
    const dialog = within(await screen.findByRole('dialog'))
    await user.type(dialog.getByLabelText(/^title/i), 'X')
    await user.selectOptions(dialog.getByLabelText(/assign to/i), employee.id)
    await user.type(dialog.getByLabelText('Due date'), '2026-03-01')
    await user.click(dialog.getByRole('button', { name: 'Assign task' }))
    expect(await dialog.findByText('The due date cannot be before the task date.')).toBeInTheDocument()
  })

  it('shows the server\'s reason when it refuses an assignment', async () => {
    setup([
      http.get(`${BASE}/tasks`, () => HttpResponse.json(list([]))),
      http.post(`${BASE}/tasks`, () => apiError(403, 'forbidden', 'You do not have permission to assign a task to this user.')),
    ])
    renderApp('/tasks')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Assign a task' }))
    const dialog = within(await screen.findByRole('dialog'))
    await user.type(dialog.getByLabelText(/^title/i), 'X')
    await user.selectOptions(dialog.getByLabelText(/assign to/i), employee.id)
    await user.click(dialog.getByRole('button', { name: 'Assign task' }))
    expect(await dialog.findByText('You do not have permission to assign a task to this user.')).toBeInTheDocument()
  })

  it('offers another manager as an assignee only when the Owner granted assign_tasks_to_manager for them', async () => {
    const peer = person({ id: 'm-2', name: 'Priya Peer', role: 'manager', manager_id: owner.id })
    setup([
      http.get(`${BASE}/tasks`, () => HttpResponse.json(list([]))),
      http.get(`${BASE}/users`, () => HttpResponse.json(list([peer]))),
      http.get(`${BASE}/permissions/me`, () =>
        HttpResponse.json({
          role: 'manager', unrestricted: false, role_defaults: [],
          grants: [{ permission_key: 'assign_tasks_to_manager', scope_type: 'user', scope_id: 'm-2', effect: 'allow', expires_at: null }],
        }),
      ),
    ])
    renderApp('/tasks')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Assign a task' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(await dialog.findByRole('option', { name: /Priya Peer/ })).toBeInTheDocument()
  })
})

describe('Task detail for a manager', () => {
  const setupTask = (t = task(), extra: Parameters<typeof server.use> = []) =>
    setup([
      ...extra,
      http.get(`${BASE}/tasks/t-1`, () => HttpResponse.json(t)),
      http.get(`${BASE}/tasks/t-1/history`, () => HttpResponse.json([])),
    ])

  it('lets the assigner edit: only changed fields are sent', async () => {
    const seen = spy()
    setupTask(task(), [http.patch(`${BASE}/tasks/t-1`, async ({ request }) => { await seen.record(request); return HttpResponse.json(task({ title: 'Calibrate press line 4' })) })])
    renderApp('/tasks/t-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit task' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit task' }))
    const title = dialog.getByLabelText(/^title/i)
    await user.clear(title)
    await user.type(title, 'Calibrate press line 4')
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toEqual({ title: 'Calibrate press line 4' })
  })

  it('reassigns to someone else in the team', async () => {
    const seen = spy()
    setupTask(task(), [http.patch(`${BASE}/tasks/t-1`, async ({ request }) => { await seen.record(request); return HttpResponse.json(task({ assigned_to: 'e-2' })) })])
    renderApp('/tasks/t-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Reassign' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Reassign task' }))
    expect(dialog.queryByRole('option', { name: /Erin Employee/ })).not.toBeInTheDocument() // already theirs
    await user.selectOptions(dialog.getByLabelText(/reassign to/i), 'e-2')
    await user.click(dialog.getByRole('button', { name: 'Reassign' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ assigned_to: 'e-2' }))
  })

  it('offers no edit controls on a task outside the manager\'s line (read-only through a grant)', async () => {
    setupTask(task({ assigned_by: owner.id, assigned_to: 'someone-else' }))
    renderApp('/tasks/t-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Calibrate press line 3' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit task' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reassign' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save status' })).not.toBeInTheDocument()
  })

  it('lets a manager update the status of a task assigned to them by someone else, but not edit it', async () => {
    setupTask(task({ assigned_by: owner.id, assigned_to: manager.id }))
    renderApp('/tasks/t-1')
    expect(await screen.findByRole('button', { name: 'Save status' })).toBeInTheDocument()
  })
})
