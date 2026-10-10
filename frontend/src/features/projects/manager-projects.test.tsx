import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, manager, mockSession, owner } from '@/test/api'
import { list, person, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const project = (over = {}) => ({
  id: 'p-1', name: 'Plant upgrade', description: 'Line 3 modernisation', owning_manager_id: manager.id, status: 'in_progress',
  start_date: '2026-03-01', expected_end_date: '2026-06-01', actual_end_date: null, is_active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
})
const member = { id: 'pm-1', project_id: 'p-1', user_id: employee.id, role_in_project: 'Engineer', assigned_by: manager.id, assigned_at: '2026-01-02T00:00:00Z', is_active: true }
const noGrants = (defaults: { permission_key: string; allow: boolean }[], grants: unknown[] = []) =>
  http.get(`${BASE}/permissions/me`, () => HttpResponse.json({ role: 'manager', unrestricted: false, role_defaults: defaults, grants }))

function setup(extra: Parameters<typeof server.use> = []) {
  mockSession(manager)
  server.use(
    ...extra,
    http.get(`${BASE}/users/${manager.id}/subordinates`, () => HttpResponse.json([person(), person({ id: 'e-2', name: 'Eli Engineer' })])),
    http.get(`${BASE}/projects`, () => HttpResponse.json(list([project()]))),
    http.get(`${BASE}/projects/p-1`, () => HttpResponse.json(project())),
    http.get(`${BASE}/projects/p-1/members`, () => HttpResponse.json([member])),
  )
}

describe('Projects for a manager', () => {
  it('lists projects with a "New project" button when create_project is allowed', async () => {
    setup()
    renderApp('/projects')
    expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Plant upgrade' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument()
  })

  it('hides "New project" when the Owner has denied create_project', async () => {
    setup([noGrants([{ permission_key: 'create_project', allow: true }], [{ permission_key: 'create_project', scope_type: 'global', scope_id: null, effect: 'deny', expires_at: null }])])
    renderApp('/projects')
    await screen.findByRole('link', { name: 'Plant upgrade' })
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument()
  })

  it('can show only the projects I manage', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/projects`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([])) })])
    renderApp('/projects')
    await userEvent.setup().selectOptions(await screen.findByLabelText('Show'), 'managed')
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('manager_id')).toBe(manager.id))
  })

  it('creates a project and validates the dates', async () => {
    const seen = spy()
    setup([http.post(`${BASE}/projects`, async ({ request }) => { await seen.record(request); return HttpResponse.json(project({ id: 'p-2', name: 'New line' }), { status: 201 }) })])
    renderApp('/projects')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'New project' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'New project' }))
    await user.click(dialog.getByRole('button', { name: 'Create project' }))
    expect(await dialog.findByText('Give the project a name.')).toBeInTheDocument()
    await user.type(dialog.getByLabelText(/project name/i), 'New line')
    await user.type(dialog.getByLabelText('Start date'), '2026-04-10')
    await user.type(dialog.getByLabelText('Expected end'), '2026-04-01')
    await user.click(dialog.getByRole('button', { name: 'Create project' }))
    expect(await dialog.findByText('The end cannot be before the start.')).toBeInTheDocument()
    await user.clear(dialog.getByLabelText('Expected end'))
    await user.type(dialog.getByLabelText('Expected end'), '2026-05-01')
    await user.click(dialog.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toEqual({ name: 'New line', description: null, status: 'not_started', start_date: '2026-04-10', expected_end_date: '2026-05-01' })
  })
})

describe('Project detail for a manager', () => {
  it('the owning manager can edit and allocate people; archiving needs its own grant', async () => {
    setup([noGrants([])])
    renderApp('/projects/p-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Plant upgrade' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add person' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
  })

  it('a manager who does not own the project is read-only without grants', async () => {
    setup([noGrants([]), http.get(`${BASE}/projects/p-1`, () => HttpResponse.json(project({ owning_manager_id: owner.id })))])
    renderApp('/projects/p-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Plant upgrade' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit project' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add person' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument()
  })

  it('explicit grants unlock editing, member changes and archiving on another manager\'s project', async () => {
    const scoped = (key: string) => ({ permission_key: key, scope_type: 'project', scope_id: 'p-1', effect: 'allow', expires_at: null })
    setup([
      noGrants([], [scoped('modify_project'), scoped('assign_employees_to_project'), scoped('delete_archive_project')]),
      http.get(`${BASE}/projects/p-1`, () => HttpResponse.json(project({ owning_manager_id: owner.id }))),
    ])
    renderApp('/projects/p-1')
    expect(await screen.findByRole('button', { name: 'Edit project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add person' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument()
  })

  it('allocates a team member: candidates exclude people already on the project', async () => {
    const seen = spy()
    setup([http.post(`${BASE}/projects/p-1/members`, async ({ request }) => { await seen.record(request); return HttpResponse.json({ ...member, id: 'pm-2', user_id: 'e-2' }, { status: 201 }) })])
    renderApp('/projects/p-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add person' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add to project' }))
    await dialog.findByRole('option', { name: /Eli Engineer/ })
    expect(dialog.queryByRole('option', { name: /Erin Employee/ })).not.toBeInTheDocument() // already a member
    await user.selectOptions(dialog.getByLabelText(/^person/i), 'e-2')
    await user.type(dialog.getByLabelText(/role on the project/i), 'Site engineer')
    await user.click(dialog.getByRole('button', { name: 'Add to project' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ user_id: 'e-2', role_in_project: 'Site engineer' }))
  })

  it('removing a member asks first', async () => {
    let removed = 0
    setup([http.delete(`${BASE}/projects/p-1/members/${employee.id}`, () => { removed += 1; return new HttpResponse(null, { status: 204 }) })])
    renderApp('/projects/p-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Remove Erin Employee from the project' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Remove from project?' }))
    expect(removed).toBe(0)
    await user.click(dialog.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(removed).toBe(1))
  })

  it('archives only after confirmation, sending is_active false', async () => {
    const seen = spy()
    setup([
      noGrants([], [{ permission_key: 'delete_archive_project', scope_type: 'project', scope_id: 'p-1', effect: 'allow', expires_at: null }]),
      http.patch(`${BASE}/projects/p-1`, async ({ request }) => { await seen.record(request); return HttpResponse.json(project({ is_active: false })) }),
    ])
    renderApp('/projects/p-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Archive' }))
    expect(seen.seen).toHaveLength(0)
    await user.click(within(await screen.findByRole('dialog', { name: 'Archive this project?' })).getByRole('button', { name: 'Archive project' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ is_active: false }))
  })

  it('shows the server\'s message if a change is refused', async () => {
    setup([http.post(`${BASE}/projects/p-1/members`, () => apiError(403, 'forbidden', "You do not have permission to change this project's members."))])
    renderApp('/projects/p-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add person' }))
    const dialog = within(await screen.findByRole('dialog'))
    await dialog.findByRole('option', { name: /Eli Engineer/ })
    await user.selectOptions(dialog.getByLabelText(/^person/i), 'e-2')
    await user.click(dialog.getByRole('button', { name: 'Add to project' }))
    expect(await dialog.findByText("You do not have permission to change this project's members.")).toBeInTheDocument()
  })
})
