import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, manager, mockSession, owner } from '@/test/api'
import { list, person, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const peer = person({ id: 'm-2', name: 'Priya Peer', role: 'manager', manager_id: owner.id, employee_code: 'MGR002' })
const mgrPerson = person({ id: manager.id, name: manager.name, role: 'manager', manager_id: owner.id, employee_code: 'MGR001' })
const project = { id: 'p-1', name: 'Plant upgrade', description: null, owning_manager_id: peer.id, status: 'in_progress', start_date: null, expected_end_date: null, actual_end_date: null, is_active: true, created_at: '', updated_at: '' }
const grant = (over = {}) => ({
  id: 'g-1', grantee_user_id: manager.id, permission_key: 'view_manager_reports', scope_type: 'user', scope_id: peer.id,
  effect: 'allow', granted_by: owner.id, expires_at: null, created_at: '2026-03-01T05:00:00Z', revoked_at: null, ...over,
})

function setup(extra: Parameters<typeof server.use> = []) {
  mockSession(owner)
  server.use(
    ...extra,
    http.get(`${BASE}/users`, () => HttpResponse.json(list([mgrPerson, peer]))),
    http.get(`${BASE}/users/directory`, ({ request }) => {
      const ids = new URL(request.url).searchParams.getAll('ids')
      return HttpResponse.json([mgrPerson, peer, person({ id: owner.id, name: owner.name, role: 'owner' })].filter((p) => ids.includes(p.id)))
    }),
    http.get(`${BASE}/projects`, () => HttpResponse.json(list([project]))),
  )
}

describe('Permissions screen', () => {
  it('lists what is in force with names, targets and the setting', async () => {
    setup([http.get(`${BASE}/permissions/grants`, () => HttpResponse.json([grant(), grant({ id: 'g-2', permission_key: 'create_project', scope_type: 'global', scope_id: null, effect: 'deny' }), grant({ id: 'g-3', permission_key: 'modify_project', scope_type: 'project', scope_id: 'p-1' })]))])
    renderApp('/permissions')
    expect(await screen.findByRole('heading', { level: 1, name: 'Permissions' })).toBeInTheDocument()
    const table = within(await screen.findByRole('table'))
    expect(await table.findAllByRole('link', { name: 'Manny Manager' })).toHaveLength(3)
    expect(table.getByText('See another manager\'s reports')).toBeInTheDocument()
    expect(await table.findByText('Priya Peer')).toBeInTheDocument() // the target manager, by name
    expect(table.getByText('Company-wide')).toBeInTheDocument()
    expect(table.getByText('Plant upgrade')).toBeInTheDocument()
    expect(table.getByText('Denied')).toBeInTheDocument()
    expect(table.getAllByText('Allowed')).toHaveLength(2)
  })

  it('marks an expired grant as expired', async () => {
    setup([http.get(`${BASE}/permissions/grants`, () => HttpResponse.json([grant({ expires_at: '2020-01-01T00:00:00Z' })]))])
    renderApp('/permissions')
    expect(await screen.findByText('Expired')).toBeInTheDocument()
  })

  it('filters by manager and permission through the API, and by setting on the page', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/permissions/grants`, async ({ request }) => { await seen.record(request); return HttpResponse.json([grant(), grant({ id: 'g-2', effect: 'deny' })]) })])
    renderApp('/permissions')
    const user = userEvent.setup()
    await screen.findByRole('option', { name: /Manny Manager/ })
    await user.selectOptions(screen.getByLabelText('Manager'), manager.id)
    await user.selectOptions(screen.getByLabelText('Permission'), 'view_manager_reports')
    await waitFor(() => {
      const q = seen.seen.at(-1)?.url.searchParams
      expect(q?.get('grantee_user_id')).toBe(manager.id)
      expect(q?.get('permission_key')).toBe('view_manager_reports')
    })
    await user.selectOptions(screen.getByLabelText('Setting'), 'deny')
    await waitFor(() => expect(within(screen.getByRole('table')).queryByText('Allowed')).not.toBeInTheDocument())
    expect(within(screen.getByRole('table')).getByText('Denied')).toBeInTheDocument()
  })

  it('has an empty state that explains the default', async () => {
    setup()
    renderApp('/permissions')
    expect(await screen.findByText('No extra permissions have been set')).toBeInTheDocument()
  })

  it('revokes only after confirmation, naming what is lost', async () => {
    let revoked = 0
    setup([
      http.get(`${BASE}/permissions/grants`, () => HttpResponse.json([grant()])),
      http.delete(`${BASE}/permissions/grants/g-1`, () => { revoked += 1; return new HttpResponse(null, { status: 204 }) }),
    ])
    renderApp('/permissions')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Revoke See another manager's reports for Manny Manager/ }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Revoke this permission?' }))
    expect(dialog.getByText(/will lose “See another manager's reports” for Priya Peer/)).toBeInTheDocument()
    expect(revoked).toBe(0)
    await user.click(dialog.getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(revoked).toBe(1))
  })

  it('explains that revoking a denial lifts the restriction', async () => {
    setup([http.get(`${BASE}/permissions/grants`, () => HttpResponse.json([grant({ effect: 'deny' })]))])
    renderApp('/permissions')
    await userEvent.setup().click(await screen.findByRole('button', { name: /^Revoke/ }))
    expect(await screen.findByText(/restriction .* on Manny Manager will be lifted/)).toBeInTheDocument()
  })

  it('is not available to managers or employees', async () => {
    mockSession(manager)
    renderApp('/permissions')
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
  })
})

describe('Add a permission', () => {
  async function open(extra: Parameters<typeof server.use> = []) {
    setup(extra)
    renderApp('/permissions')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add a permission' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add a permission' }))
    await dialog.findByRole('option', { name: /Priya Peer/ })
    return { user, dialog }
  }

  it('offers only combinations the backend supports: deny only where it changes something', async () => {
    const { user, dialog } = await open()
    await user.selectOptions(dialog.getByLabelText(/^permission/i), 'view_manager_team')
    expect(dialog.getByLabelText('Effect')).toBeInTheDocument() // allow + deny exist for visibility
    await user.selectOptions(dialog.getByLabelText(/^permission/i), 'modify_project')
    expect(dialog.queryByLabelText('Effect')).not.toBeInTheDocument() // allow-only: deny cannot override ownership
    expect(await dialog.findByLabelText(/^project\*$/i)).toBeInTheDocument()
    await user.selectOptions(dialog.getByLabelText(/^permission/i), 'create_project')
    expect(dialog.getByLabelText('Effect')).toBeInTheDocument()
    expect(dialog.queryByLabelText(/^project\*$/i)).not.toBeInTheDocument() // company-wide: no target
  })

  it('creates a visibility restriction on a manager (scope type user)', async () => {
    const seen = spy()
    const { user, dialog } = await open([http.post(`${BASE}/permissions/grants`, async ({ request }) => { await seen.record(request); return HttpResponse.json(grant({ effect: 'deny' }), { status: 201 }) })])
    await user.selectOptions(dialog.getByLabelText(/^manager\*$/i), manager.id)
    await user.selectOptions(dialog.getByLabelText(/^permission/i), 'view_manager_reports')
    await user.selectOptions(dialog.getByLabelText('Effect'), 'deny')
    await user.selectOptions(dialog.getByLabelText(/whose reports they may see/i), 'm-2')
    expect(dialog.getByText(/Restrict/)).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Add restriction' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ grantee_user_id: manager.id, permission_key: 'view_manager_reports', scope_type: 'user', scope_id: 'm-2', effect: 'deny', expires_at: null }))
    expect(await screen.findByText('Restriction added.')).toBeInTheDocument()
  })

  it('does not let a manager be both the grantee and the target', async () => {
    const { user, dialog } = await open()
    await user.selectOptions(dialog.getByLabelText(/^manager\*$/i), manager.id)
    await user.selectOptions(dialog.getByLabelText(/^permission/i), 'view_manager_team')
    expect(within(dialog.getByLabelText(/whose team they may see/i)).queryByRole('option', { name: /Manny Manager/ })).not.toBeInTheDocument()
  })

  it('creates a company-wide permission without a target, and a project permission with an end date', async () => {
    const seen = spy()
    const { user, dialog } = await open([http.post(`${BASE}/permissions/grants`, async ({ request }) => { await seen.record(request); return HttpResponse.json(grant(), { status: 201 }) })])
    await user.selectOptions(dialog.getByLabelText(/^manager\*$/i), manager.id)
    await user.selectOptions(dialog.getByLabelText(/^permission/i), 'create_project')
    await user.selectOptions(dialog.getByLabelText('Effect'), 'deny')
    await user.click(dialog.getByRole('button', { name: 'Add restriction' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ grantee_user_id: manager.id, permission_key: 'create_project', scope_type: 'global', scope_id: null, effect: 'deny', expires_at: null }))
  })

  it('sends a project permission with the end of that company day', async () => {
    const seen = spy()
    const { user, dialog } = await open([http.post(`${BASE}/permissions/grants`, async ({ request }) => { await seen.record(request); return HttpResponse.json(grant(), { status: 201 }) })])
    await user.selectOptions(dialog.getByLabelText(/^manager\*$/i), manager.id)
    await user.selectOptions(dialog.getByLabelText(/^permission/i), 'modify_project')
    await user.selectOptions(await dialog.findByLabelText(/^project\*$/i), 'p-1')
    await user.type(dialog.getByLabelText('Until'), '2026-03-10')
    await user.click(dialog.getByRole('button', { name: 'Add permission' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ grantee_user_id: manager.id, permission_key: 'modify_project', scope_type: 'project', scope_id: 'p-1', effect: 'allow', expires_at: '2026-03-10T18:29:00.000Z' }))
  })

  it('validates required choices and refuses an exact duplicate', async () => {
    const { user, dialog } = await open([http.get(`${BASE}/permissions/grants`, () => HttpResponse.json([grant()]))])
    await user.click(dialog.getByRole('button', { name: 'Add permission' }))
    expect(await dialog.findByText('Choose the manager this applies to.')).toBeInTheDocument()
    expect(dialog.getByText('Choose a permission.')).toBeInTheDocument()
    await user.selectOptions(dialog.getByLabelText(/^manager\*$/i), manager.id)
    await user.selectOptions(dialog.getByLabelText(/^permission/i), 'view_manager_reports')
    await user.selectOptions(dialog.getByLabelText(/whose reports they may see/i), 'm-2')
    expect(await dialog.findByText('This exact permission is already in place for that manager.')).toBeInTheDocument()
  })

  it('warns when the opposite setting already exists (a deny wins)', async () => {
    const { user, dialog } = await open([http.get(`${BASE}/permissions/grants`, () => HttpResponse.json([grant()]))])
    await user.selectOptions(dialog.getByLabelText(/^manager\*$/i), manager.id)
    await user.selectOptions(dialog.getByLabelText(/^permission/i), 'view_manager_reports')
    await user.selectOptions(dialog.getByLabelText('Effect'), 'deny')
    await user.selectOptions(dialog.getByLabelText(/whose reports they may see/i), 'm-2')
    expect(await dialog.findByText(/A deny always wins over an allow/)).toBeInTheDocument()
  })

  it('shows the server\'s message when it refuses', async () => {
    const { user, dialog } = await open([http.post(`${BASE}/permissions/grants`, () => apiError(422, 'validation_failed', 'permission_key does not reference a known permission.'))])
    await user.selectOptions(dialog.getByLabelText(/^manager\*$/i), manager.id)
    await user.selectOptions(dialog.getByLabelText(/^permission/i), 'create_project')
    await user.click(dialog.getByRole('button', { name: 'Add permission' }))
    expect(await dialog.findByText('permission_key does not reference a known permission.')).toBeInTheDocument()
    void employee
  })
})
