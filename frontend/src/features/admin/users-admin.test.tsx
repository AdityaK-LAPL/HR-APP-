import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, manager, mockSession, owner } from '@/test/api'
import { list, person, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const ownerPerson = person({ id: owner.id, name: owner.name, role: 'owner', manager_id: null, employee_code: 'OWN001' })
const mgr = person({ id: manager.id, name: manager.name, role: 'manager', manager_id: owner.id, employee_code: 'MGR001' })
const peer = person({ id: 'm-2', name: 'Priya Peer', role: 'manager', manager_id: owner.id, employee_code: 'MGR002' })
const erin = person()
const inactive = person({ id: 'e-9', name: 'Ivan Inactive', is_active: false, employee_code: 'EMP009' })

function setup(extra: Parameters<typeof server.use> = []) {
  mockSession(owner)
  server.use(
    ...extra,
    http.get(`${BASE}/users`, ({ request }) => {
      const q = new URL(request.url).searchParams
      let rows = [ownerPerson, mgr, peer, erin, inactive]
      if (q.get('manager_id')) rows = rows.filter((p) => p.manager_id === q.get('manager_id'))
      if (q.get('is_active') === 'true') rows = rows.filter((p) => p.is_active)
      if (q.get('role')) rows = rows.filter((p) => p.role === q.get('role'))
      return HttpResponse.json(list(rows))
    }),
    http.get(`${BASE}/users/${erin.id}`, () => HttpResponse.json(erin)),
    http.get(`${BASE}/users/${mgr.id}`, () => HttpResponse.json(mgr)),
    http.get(`${BASE}/users/${owner.id}`, () => HttpResponse.json(ownerPerson)),
    http.get(`${BASE}/users/${inactive.id}`, () => HttpResponse.json(inactive)),
  )
}

describe('Users & hierarchy (Owner)', () => {
  it('lists everyone, distinguishing active from inactive, with the owner\'s own heading', async () => {
    setup()
    renderApp('/users?state=all')
    expect(await screen.findByRole('heading', { level: 1, name: 'Users & hierarchy' })).toBeInTheDocument()
    const table = within(await screen.findByRole('table'))
    expect(await table.findByRole('link', { name: 'Priya Peer' })).toBeInTheDocument()
    const ivan = within(table.getByRole('row', { name: /Ivan Inactive/ }))
    expect(ivan.getByText('Inactive')).toBeInTheDocument()
    expect(within(table.getByRole('row', { name: /Erin Employee/ })).getByText('Active')).toBeInTheDocument()
  })

  it('filters by who people report to, role and status through the API', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/users`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list(new URL(request.url).searchParams.get('page_size') === '100' ? [mgr] : [])) })])
    renderApp('/users')
    const user = userEvent.setup()
    await screen.findByRole('option', { name: /Manny Manager/ })
    await user.selectOptions(screen.getByLabelText('Reports to'), manager.id)
    await user.selectOptions(screen.getByLabelText('Status'), 'inactive')
    await waitFor(() => {
      const q = seen.seen.at(-1)?.url.searchParams
      expect(q?.get('manager_id')).toBe(manager.id)
      expect(q?.get('is_active')).toBe('false')
    })
  })

  describe('adding a person', () => {
    async function openDialog(extra: Parameters<typeof server.use> = []) {
      setup(extra)
      renderApp('/users')
      const user = userEvent.setup()
      await user.click(await screen.findByRole('button', { name: 'Add a person' }))
      const dialog = within(await screen.findByRole('dialog', { name: 'Add a person' }))
      await dialog.findByRole('option', { name: /Priya Peer/ })
      return { user, dialog }
    }

    it('offers only managers (and the owner) as "reports to"', async () => {
      const { dialog } = await openDialog()
      const options = dialog.getAllByRole('option').map((o) => o.textContent)
      expect(options).toEqual(expect.arrayContaining([expect.stringContaining('Priya Peer'), expect.stringContaining('Manny Manager'), expect.stringContaining('Olivia Owner')]))
      expect(options.join('|')).not.toContain('Erin Employee')
    })

    it('validates, then sends exactly what was entered and opens the new person', async () => {
      const seen = spy()
      const created = person({ id: 'new-1', name: 'Nina New', employee_code: 'EMP100', role: 'manager' })
      const { user, dialog } = await openDialog([
        http.post(`${BASE}/users`, async ({ request }) => { await seen.record(request); return HttpResponse.json(created, { status: 201 }) }),
        http.get(`${BASE}/users/new-1`, () => HttpResponse.json(created)),
      ])
      await user.click(dialog.getByRole('button', { name: 'Add person' }))
      expect(await dialog.findByText('Enter an employee ID.')).toBeInTheDocument()
      expect(dialog.getByText('Enter a name.')).toBeInTheDocument()
      expect(dialog.getByText('Enter a temporary password.')).toBeInTheDocument()
      await user.type(dialog.getByLabelText(/employee id/i), ' EMP100 ')
      await user.type(dialog.getByLabelText(/^name/i), 'Nina New')
      await user.type(dialog.getByLabelText('Designation'), 'Site Lead')
      await user.selectOptions(dialog.getByLabelText('Role'), 'manager')
      await user.selectOptions(dialog.getByLabelText('Reports to'), owner.id)
      await user.type(dialog.getByLabelText(/temporary password/i), 'short')
      await user.click(dialog.getByRole('button', { name: 'Add person' }))
      expect(await dialog.findByText('Use at least 8 characters.')).toBeInTheDocument()
      await user.clear(dialog.getByLabelText(/temporary password/i))
      await user.type(dialog.getByLabelText(/temporary password/i), 'Temp#2026pass')
      await user.click(dialog.getByRole('button', { name: 'Add person' }))
      await waitFor(() => expect(seen.seen).toHaveLength(1))
      expect(seen.seen[0]?.body).toEqual({ employee_code: 'EMP100', name: 'Nina New', designation: 'Site Lead', role: 'manager', manager_id: owner.id, initial_password: 'Temp#2026pass' })
      expect(await screen.findByRole('heading', { level: 1, name: 'Nina New' })).toBeInTheDocument()
    })

    it('shows the server\'s reason when the employee ID is taken', async () => {
      const { user, dialog } = await openDialog([http.post(`${BASE}/users`, () => apiError(409, 'conflict', 'employee_code is already in use.'))])
      await user.type(dialog.getByLabelText(/employee id/i), 'EMP001')
      await user.type(dialog.getByLabelText(/^name/i), 'Dup')
      await user.type(dialog.getByLabelText(/temporary password/i), 'Temp#2026pass')
      await user.click(dialog.getByRole('button', { name: 'Add person' }))
      expect(await dialog.findByText('employee_code is already in use.')).toBeInTheDocument()
    })
  })

  it('"Move" in the reporting structure changes someone\'s manager', async () => {
    const seen = spy()
    setup([
      http.get(`${BASE}/hierarchy`, () => HttpResponse.json([
        { id: owner.id, employee_code: 'OWN001', name: owner.name, role: 'owner', manager_id: null },
        { id: manager.id, employee_code: 'MGR001', name: manager.name, role: 'manager', manager_id: owner.id },
        { id: peer.id, employee_code: 'MGR002', name: peer.name, role: 'manager', manager_id: owner.id },
        { id: erin.id, employee_code: 'EMP001', name: erin.name, role: 'employee', manager_id: manager.id },
      ])),
      http.patch(`${BASE}/hierarchy/${erin.id}/manager`, async ({ request }) => { await seen.record(request); return HttpResponse.json({ id: erin.id, employee_code: 'EMP001', name: erin.name, role: 'employee', manager_id: peer.id }) }),
    ])
    renderApp('/users?view=structure')
    const user = userEvent.setup()
    expect(screen.queryByRole('button', { name: /Change manager for Olivia/ })).not.toBeInTheDocument() // the owner is not movable
    await user.click(await screen.findByRole('button', { name: 'Change manager for Erin Employee' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Change manager for Erin Employee' }))
    await dialog.findByRole('option', { name: /Priya Peer/ })
    expect(dialog.queryByRole('option', { name: /Erin Employee/ })).not.toBeInTheDocument()
    await user.selectOptions(dialog.getByLabelText('Reports to'), peer.id)
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ manager_id: peer.id }))
  })
})

describe('A person, seen by the Owner', () => {
  it('offers role, manager and status controls, plus edit and password reset', async () => {
    setup()
    renderApp(`/users/${erin.id}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Erin Employee' })).toBeInTheDocument()
    for (const name of ['Edit profile', 'Change role', 'Change manager', 'Deactivate', 'Reset password']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByText('EMP001', { selector: 'dd' })).toBeInTheDocument() // the employee ID is shown but cannot be edited
  })

  it('changes a role', async () => {
    const seen = spy()
    setup([http.patch(`${BASE}/users/${erin.id}`, async ({ request }) => { await seen.record(request); return HttpResponse.json({ ...erin, role: 'manager' }) })])
    renderApp(`/users/${erin.id}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Change role' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Change role for Erin Employee' }))
    expect(dialog.getByRole('button', { name: 'Change role' })).toBeDisabled() // nothing chosen yet
    await user.selectOptions(dialog.getByLabelText('Role'), 'manager')
    await user.click(dialog.getByRole('button', { name: 'Change role' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ role: 'manager' }))
  })

  it('warns before demoting a manager who still has people reporting to them', async () => {
    setup()
    renderApp(`/users/${mgr.id}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Change role' }))
    const dialog = within(await screen.findByRole('dialog'))
    await user.selectOptions(dialog.getByLabelText('Role'), 'employee')
    expect(await dialog.findByText(/still has 1 person reporting to them/)).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Make employee' })).toBeInTheDocument()
  })

  it('deactivates only after confirmation, explaining what is kept, and can reactivate', async () => {
    const seen = spy()
    setup([http.patch(`${BASE}/users/:id`, async ({ request }) => { await seen.record(request); return HttpResponse.json({ ...erin, is_active: false }) })])
    renderApp(`/users/${erin.id}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Deactivate Erin Employee?' }))
    expect(dialog.getByText(/no longer be able to sign in/)).toBeInTheDocument()
    expect(dialog.getByText(/records are kept/)).toBeInTheDocument()
    expect(seen.seen).toHaveLength(0)
    await user.click(dialog.getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ is_active: false }))
  })

  it('mentions people who still report to a person being deactivated', async () => {
    setup()
    renderApp(`/users/${mgr.id}`)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Deactivate' }))
    expect(await screen.findByText(/1 person still reports to them/)).toBeInTheDocument()
  })

  it('an inactive person shows as inactive and can be reactivated', async () => {
    const seen = spy()
    setup([http.patch(`${BASE}/users/${inactive.id}`, async ({ request }) => { await seen.record(request); return HttpResponse.json({ ...inactive, is_active: true }) })])
    renderApp(`/users/${inactive.id}`)
    const user = userEvent.setup()
    expect(await screen.findByText('Inactive', { selector: '.badge' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reactivate' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Reactivate Ivan Inactive?' })).getByRole('button', { name: 'Reactivate' }))
    await waitFor(() => expect(seen.seen[0]?.body).toEqual({ is_active: true }))
  })

  it('does not let the owner deactivate or re-role the owner account', async () => {
    setup()
    renderApp(`/users/${owner.id}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Olivia Owner' })).toBeInTheDocument()
    for (const name of ['Deactivate', 'Change role', 'Change manager']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })

  it('shows a manager\'s extra permissions, with a link to manage them', async () => {
    setup([http.get(`${BASE}/permissions/grants`, () => HttpResponse.json([{ id: 'g-1', grantee_user_id: mgr.id, permission_key: 'view_manager_team', scope_type: 'user', scope_id: peer.id, effect: 'allow', granted_by: owner.id, expires_at: null, created_at: '2026-03-01T00:00:00Z', revoked_at: null }]))])
    renderApp(`/users/${mgr.id}`)
    expect(await screen.findByRole('heading', { name: 'Extra permissions' })).toBeInTheDocument()
    expect(await screen.findByText(/See another manager's team/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', `/permissions?manager=${mgr.id}`)
  })
})
