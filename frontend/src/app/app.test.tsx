import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import type { UserProfile } from '@/api/types'
import { BASE, apiError, employee, manager, mockConfig, mockSession, owner } from '@/test/api'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

/** A stateful API double: /auth/me answers 401 until login succeeds. */
function mockLogin(user: UserProfile, password = 'right-password') {
  mockConfig()
  let signedIn = false
  server.use(
    http.get(`${BASE}/auth/me`, () =>
      signedIn ? HttpResponse.json(user) : apiError(401, 'authentication_failed', 'Not authenticated.'),
    ),
    http.post(`${BASE}/auth/login`, async ({ request }) => {
      const body = (await request.json()) as { employee_code: string; password: string }
      if (body.employee_code === user.employee_code && body.password === password) {
        signedIn = true
        return HttpResponse.json(user)
      }
      return apiError(401, 'authentication_failed', 'Invalid employee ID or password.')
    }),
    http.post(`${BASE}/auth/logout`, () => {
      signedIn = false
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${BASE}/permissions/me`, () =>
      HttpResponse.json({ role: user.role, unrestricted: false, role_defaults: [], grants: [] }),
    ),
    http.get(`${BASE}/users/directory`, () =>
      HttpResponse.json([{ ...manager, designation: manager.designation }]),
    ),
  )
}

async function signIn(code: string, password: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText(/employee id/i), code)
  await user.type(screen.getByLabelText(/^password/i), password)
  await user.click(screen.getByRole('button', { name: /sign in/i }))
  return user
}

describe('signing in', () => {
  it('sends an anonymous visitor to the login page and returns them to where they were going', async () => {
    mockLogin(employee)
    renderApp('/tasks')
    expect(await screen.findByRole('heading', { name: /welcome to opsflow/i })).toBeInTheDocument()

    await signIn('EMP001', 'right-password')
    expect(await screen.findByRole('heading', { name: /my tasks|tasks/i, level: 1 })).toBeInTheDocument()
  })

  it('shows the server message for wrong credentials and stays on the form', async () => {
    mockLogin(employee)
    renderApp('/login')
    await signIn('EMP001', 'nope')
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid employee ID or password.')
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled()
  })

  it('maps server field errors onto the field', async () => {
    mockLogin(employee)
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        apiError(422, 'validation_failed', 'The request contained invalid data.', [
          { field: 'employee_code', message: 'Employee ID is too long.', type: 'string_too_long' },
        ]),
      ),
    )
    renderApp('/login')
    await signIn('X'.repeat(80), 'whatever')
    expect(await screen.findByText('Employee ID is too long.')).toBeInTheDocument()
  })

  it('asks for both fields before calling the server', async () => {
    mockLogin(employee)
    let calls = 0
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/auth/login')) calls += 1
    })
    renderApp('/login')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /sign in/i }))
    expect(await screen.findByText('Enter your Employee ID.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(calls).toBe(0)
  })

  it('tells the user to wait after too many attempts', async () => {
    mockLogin(employee)
    server.use(
      http.post(`${BASE}/auth/login`, () => apiError(429, 'rate_limit_exceeded', 'Too many requests.')),
    )
    renderApp('/login')
    await signIn('EMP001', 'x')
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i)
  })

  it('restores an existing session without showing the login page', async () => {
    mockSession(manager)
    renderApp('/')
    expect(await screen.findByRole('heading', { name: /hello, manny/i })).toBeInTheDocument()
  })

  it('shows who the user reports to using the directory (names for ids)', async () => {
    mockSession(manager) // reports to the owner; shown on the foundation dashboard
    renderApp('/dashboard')
    expect(await screen.findByText('Olivia Owner')).toBeInTheDocument()
    expect(screen.getByText(/Mar 2026/)).toBeInTheDocument() // company day from /config
  })
})

describe('forced password change', () => {
  const temp: UserProfile = { ...employee, must_reset: true }

  it('traps a user with a temporary password on the change-password screen', async () => {
    mockSession(temp)
    renderApp('/tasks')
    expect(await screen.findByRole('heading', { name: /change your password/i })).toBeInTheDocument()
    expect(screen.getByText(/temporary password/i)).toBeInTheDocument()
  })

  it('validates the form, then signs the user out with a notice on success', async () => {
    mockSession(temp)
    server.use(http.post(`${BASE}/auth/change-password`, () => new HttpResponse(null, { status: 204 })))
    renderApp('/change-password')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/^current password/i), 'temp-pass')
    await user.type(screen.getByLabelText(/^new password/i), 'brand-new-pass')
    await user.type(screen.getByLabelText(/confirm new password/i), 'different')
    await user.click(screen.getByRole('button', { name: /^change password/i }))
    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/confirm new password/i))
    await user.type(screen.getByLabelText(/confirm new password/i), 'brand-new-pass')
    await user.click(screen.getByRole('button', { name: /^change password/i }))
    expect(await screen.findByRole('heading', { name: /welcome to opsflow/i })).toBeInTheDocument()
    expect(screen.getByText(/password changed/i)).toBeInTheDocument()
  })

  it('lands in the app, not back on the password form, when signing in after the change', async () => {
    let password = 'temp-pass'
    let mustReset = true
    let signedIn = false
    mockConfig()
    server.use(
      http.get(`${BASE}/auth/me`, () =>
        signedIn ? HttpResponse.json({ ...employee, must_reset: mustReset }) : apiError(401, 'authentication_failed', 'No.'),
      ),
      http.post(`${BASE}/auth/login`, async ({ request }) => {
        const body = (await request.json()) as { password: string }
        if (body.password !== password) return apiError(401, 'authentication_failed', 'Invalid employee ID or password.')
        signedIn = true
        return HttpResponse.json({ ...employee, must_reset: mustReset })
      }),
      http.post(`${BASE}/auth/change-password`, async ({ request }) => {
        password = ((await request.json()) as { new_password: string }).new_password
        mustReset = false
        signedIn = false
        return new HttpResponse(null, { status: 204 })
      }),
      http.get(`${BASE}/users/directory`, () => HttpResponse.json([])),
    )
    renderApp('/login')
    await signIn('EMP001', 'temp-pass')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/^current password/i), 'temp-pass')
    await user.type(screen.getByLabelText(/^new password/i), 'brand-new-pass')
    await user.type(screen.getByLabelText(/confirm new password/i), 'brand-new-pass')
    await user.click(screen.getByRole('button', { name: /^change password/i }))
    await screen.findByText(/password changed/i)

    await signIn('EMP001', 'brand-new-pass')
    expect(await screen.findByRole('heading', { name: /hello, erin/i })).toBeInTheDocument()
  })

  it('shows a server rejection of the new password on its field', async () => {
    mockSession(employee)
    server.use(
      http.post(`${BASE}/auth/change-password`, () =>
        apiError(422, 'validation_failed', 'invalid', [
          { field: 'new_password', message: 'Password is too common.', type: 'value_error' },
        ]),
      ),
    )
    renderApp('/change-password')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/^current password/i), 'old-password')
    await user.type(screen.getByLabelText(/^new password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /^change password/i }))
    expect(await screen.findByText('Password is too common.')).toBeInTheDocument()
  })
})

describe('role-aware navigation (a display hint; the API is the authority)', () => {
  it('shows the Owner the administration screens', async () => {
    mockSession(owner)
    renderApp('/dashboard')
    const nav = await screen.findByRole('navigation', { name: 'Main menu' })
    expect(within(nav).getByRole('link', { name: 'Permissions' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Audit trail' })).toBeInTheDocument()
  })

  it('hides them from an Employee and shows a neutral screen if they type the URL', async () => {
    mockSession(employee)
    renderApp('/permissions')
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Permissions' })).not.toBeInTheDocument()
  })

  it('gives unknown URLs the same neutral screen', async () => {
    mockSession(manager)
    renderApp('/definitely/not/a/page')
    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
  })
})

describe('session end', () => {
  it('signs out from the account menu and returns to the login page', async () => {
    mockLogin(employee)
    renderApp('/login')
    await signIn('EMP001', 'right-password')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /account menu for erin employee/i }))
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }))
    expect(await screen.findByRole('heading', { name: /welcome to opsflow/i })).toBeInTheDocument()
  })

  it('returns to login with a notice when the session cannot be refreshed', async () => {
    mockSession(employee)
    server.use(
      http.get(`${BASE}/tasks`, () => apiError(401, 'authentication_failed', 'Not authenticated.')),
      http.post(`${BASE}/auth/refresh`, () => apiError(401, 'authentication_failed', 'expired')),
    )
    renderApp('/dashboard')
    expect(await screen.findByText(/your session expired/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { name: /welcome to opsflow/i })).toBeInTheDocument())
  })
})
