import { screen, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, employee, manager, mockSession, owner } from '@/test/api'
import { call, day, leave, list, task } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

describe('Employee dashboard', () => {
  it('summarises the day from the API: tiles, today\'s tasks, attendance and service calls', async () => {
    mockSession(employee)
    server.use(
      http.get(`${BASE}/tasks`, ({ request }) => {
        const p = new URL(request.url).searchParams
        if (p.get('status') === 'in_progress') return HttpResponse.json(list([task()], { total: 7 }))
        return HttpResponse.json(list([task({ title: 'Calibrate press line 3' })], { total: 3 }))
      }),
      http.get(`${BASE}/leaves`, () => HttpResponse.json(list([leave()], { total: 2 }))),
      http.get(`${BASE}/service-calls`, () => HttpResponse.json(list([call()], { total: 4 }))),
      http.get(`${BASE}/customers/cust-1`, () => HttpResponse.json({ id: 'cust-1', name: 'Acme Forgings', customer_code: 'CU-7' })),
      http.get(`${BASE}/attendance`, () => HttpResponse.json(list([day()]))),
    )
    renderApp('/dashboard')
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello, Erin' })).toBeInTheDocument()
    const tiles = await screen.findAllByRole('link', { name: /tasks today|in progress|leave awaiting approval|service calls/i })
    const text = tiles.map((t) => t.textContent)
    expect(text).toEqual(expect.arrayContaining(['3Tasks today', '7In progress', '2Leave awaiting approval', '4Service calls']))
    expect(await screen.findByRole('link', { name: 'Calibrate press line 3' })).toBeInTheDocument()
    expect(await screen.findByText(/punched in at/i)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /SC-1042 · Acme Forgings/ })).toBeInTheDocument()
  })
})

describe('Roles', () => {
  it('keeps the owner on placeholders (the owner screens come in Prompt 9)', async () => {
    mockSession(owner)
    renderApp('/tasks')
    expect(await screen.findByText('Not built yet')).toBeInTheDocument()
    expect(screen.queryByText('No tasks assigned to you')).not.toBeInTheDocument()
  })

  it('gives managers their own team screens, not the employee ones', async () => {
    mockSession(manager)
    renderApp('/tasks')
    expect(await screen.findByRole('heading', { level: 1, name: 'Team tasks' })).toBeInTheDocument()
    expect(screen.queryByText('Not built yet')).not.toBeInTheDocument()
  })

  it('does not expose employee detail screens to other roles', async () => {
    mockSession(owner)
    renderApp('/tasks/t-1')
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
  })

  it('shows the profile to every role, with the manager\'s name resolved through the directory', async () => {
    mockSession(employee)
    renderApp('/profile')
    const facts = await screen.findByRole('heading', { level: 1, name: 'My profile' })
    expect(facts).toBeInTheDocument()
    expect(await screen.findByText('Manny Manager')).toBeInTheDocument()
    expect(screen.getByText('EMP001')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /change password/i })).toHaveAttribute('href', '/change-password')
    const manager_ = within(document.body)
    expect(manager_.getByText('Employee', { selector: 'dd' })).toBeInTheDocument()
  })
})
