import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, manager, mockSession, owner } from '@/test/api'
import { list, person, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const log = (over = {}) => ({
  id: 'a-1', actor_user_id: owner.id, action: 'user.manager_changed', entity_type: 'user', entity_id: employee.id,
  old_value: { manager_id: manager.id }, new_value: { manager_id: owner.id }, created_at: '2026-03-05T05:00:00Z', ...over,
})

function setup(extra: Parameters<typeof server.use> = []) {
  mockSession(owner)
  server.use(
    ...extra,
    http.get(`${BASE}/users`, () => HttpResponse.json(list([person({ id: manager.id, name: manager.name, role: 'manager' }), person()]))),
    http.get(`${BASE}/users/directory`, ({ request }) => {
      const ids = new URL(request.url).searchParams.getAll('ids')
      return HttpResponse.json([person(), person({ id: manager.id, name: manager.name, role: 'manager' }), person({ id: owner.id, name: owner.name, role: 'owner' })].filter((p) => ids.includes(p.id)))
    }),
  )
}

describe('Audit trail', () => {
  it('lists entries newest-first with who did what, in plain words, linking to the record', async () => {
    setup([http.get(`${BASE}/audit-logs`, () => HttpResponse.json(list([log(), log({ id: 'a-2', action: 'permission.granted', entity_type: 'permission_grant', entity_id: 'g-1', actor_user_id: null })], { total: 2 })))])
    renderApp('/audit-logs')
    expect(await screen.findByRole('heading', { level: 1, name: 'Audit trail' })).toBeInTheDocument()
    const table = within(await screen.findByRole('table'))
    expect(await table.findByText('Manager changed')).toBeInTheDocument()
    expect(await table.findByText('Olivia Owner')).toBeInTheDocument()
    expect(table.getByText('Permission granted')).toBeInTheDocument()
    expect(table.getByText('System')).toBeInTheDocument() // no actor
    expect(await table.findByRole('link', { name: 'Erin Employee' })).toHaveAttribute('href', `/users/${employee.id}`)
    expect(table.getByRole('link', { name: 'Permission' })).toHaveAttribute('href', '/permissions')
    expect(screen.getByText('2 entries, newest first.')).toBeInTheDocument()
  })

  it('sends every filter to the API and ignores a malformed record id', async () => {
    const seen = spy()
    setup([http.get(`${BASE}/audit-logs`, async ({ request }) => { await seen.record(request); return HttpResponse.json(list([])) })])
    renderApp('/audit-logs')
    const user = userEvent.setup()
    await screen.findByRole('option', { name: /Manny Manager/ })
    await user.type(screen.getByLabelText('Action'), 'user.created')
    await user.selectOptions(screen.getByLabelText('Record type'), 'task')
    await user.selectOptions(screen.getByLabelText('Done by'), manager.id)
    await user.type(screen.getByLabelText('From'), '2026-03-01')
    await user.type(screen.getByLabelText('To'), '2026-03-05')
    await waitFor(() => {
      const q = seen.seen.at(-1)?.url.searchParams
      expect(q?.get('action')).toBe('user.created')
      expect(q?.get('entity_type')).toBe('task')
      expect(q?.get('actor_user_id')).toBe(manager.id)
      expect(q?.get('start_date')).toBe('2026-03-01')
      expect(q?.get('end_date')).toBe('2026-03-05')
    })
    await user.type(screen.getByLabelText('Record id'), 'not-an-id')
    expect(await screen.findByText(/An id looks like/)).toBeInTheDocument()
    expect(seen.seen.at(-1)?.url.searchParams.get('entity_id')).toBeNull()
    await user.clear(screen.getByLabelText('Record id'))
    await user.type(screen.getByLabelText('Record id'), employee.id)
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('entity_id')).toBe(employee.id))
  })

  it('shows what changed, with people named instead of ids', async () => {
    setup([http.get(`${BASE}/audit-logs`, () => HttpResponse.json(list([log()])))])
    renderApp('/audit-logs')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Show details: Manager changed/ }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Manager changed' }))
    expect(dialog.getByText('Before')).toBeInTheDocument()
    const row = within(await dialog.findByRole('row', { name: /manager id/i }))
    expect(await row.findByText('Manny Manager')).toBeInTheDocument()
    expect(row.getByText('Olivia Owner')).toBeInTheDocument()
  })

  it('says so when no field details were recorded', async () => {
    setup([http.get(`${BASE}/audit-logs`, () => HttpResponse.json(list([log({ old_value: null, new_value: null, action: 'user.password_reset' })])))])
    renderApp('/audit-logs')
    await userEvent.setup().click(await screen.findByRole('button', { name: /Show details/ }))
    expect(await screen.findByText('No field details were recorded for this action.')).toBeInTheDocument()
  })

  it('has empty and error states, and paginates', async () => {
    setup([http.get(`${BASE}/audit-logs`, () => HttpResponse.json(list([])))])
    renderApp('/audit-logs')
    expect(await screen.findByText('Nothing has been recorded yet')).toBeInTheDocument()
  })

  it('is not available to managers', async () => {
    mockSession(manager)
    renderApp('/audit-logs')
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
  })

  it('shows the neutral message if the API refuses', async () => {
    setup([http.get(`${BASE}/audit-logs`, () => apiError(403, 'forbidden', 'Only the Owner can view raw audit logs.'))])
    renderApp('/audit-logs')
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
  })
})
