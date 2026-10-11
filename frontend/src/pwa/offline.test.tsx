import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, OFFLINE_MESSAGE } from '@/api/client'
import { ApiError } from '@/api/errors'
import { createQueryClient } from '@/api/queryClient'
import { OfflineBanner } from '@/components/feedback/OfflineBanner'
import { Button } from '@/components/ui/Button'
import { isIosSafari } from '@/lib/platform'
import { BASE, employee, mockSession } from '@/test/api'
import { list, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

/** `navigator.onLine` is a getter on the prototype; spy on it and tell the app the way a browser would. */
function goOffline() {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
  act(() => void window.dispatchEvent(new Event('offline')))
}
function goOnline() {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true)
  act(() => void window.dispatchEvent(new Event('online')))
}

afterEach(() => vi.restoreAllMocks())

describe('changes are never sent (or queued) without a connection', () => {
  it('refuses a POST / PATCH / DELETE while offline, before it leaves the browser', async () => {
    const hits = spy()
    server.use(
      http.post(`${BASE}/thing`, async ({ request }) => { await hits.record(request); return HttpResponse.json({}) }),
      http.get(`${BASE}/thing`, () => HttpResponse.json({ ok: true })),
    )
    goOffline()
    for (const call of [() => api.post('/thing', {}), () => api.patch('/thing', {}), () => api.delete('/thing')]) {
      const error = (await call().catch((e: unknown) => e)) as ApiError
      expect(error).toBeInstanceOf(ApiError)
      expect(error.isNetworkError).toBe(true)
      expect(error.message).toBe(OFFLINE_MESSAGE)
    }
    expect(hits.seen).toHaveLength(0)
    goOnline()
    await expect(api.post('/thing', {})).resolves.toEqual({})
    expect(hits.seen).toHaveLength(1)
  })

  it('does not queue a change to replay later: the query client never pauses mutations', () => {
    const defaults = createQueryClient().getDefaultOptions()
    expect(defaults.mutations?.networkMode).toBe('always')
    expect(defaults.mutations?.retry).toBe(false)
    expect(defaults.queries?.networkMode).toBe('always') // reads fail at once instead of hanging as a skeleton
  })
})

describe('buttons that save are switched off offline', () => {
  it('disables submit and action buttons with a reason, and leaves navigation-style buttons alone', () => {
    render(
      <>
        <Button type="submit">Save</Button>
        <Button variant="danger">Delete</Button>
        <Button variant="success">Approve</Button>
        <Button>Assign</Button>
        <Button variant="outline">Cancel</Button>
        <Button aria-pressed="true">Today</Button>
        <Button needsConnection={false}>Reload to update</Button>
        <Button needsConnection>Custom save</Button>
      </>,
    )
    goOffline()
    for (const name of ['Save', 'Delete', 'Approve', 'Assign', 'Custom save']) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'Needs a connection')
    }
    for (const name of ['Cancel', 'Today', 'Reload to update']) expect(screen.getByRole('button', { name })).toBeEnabled()
    goOnline()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('title')
  })

  it('the banner explains it', () => {
    render(<OfflineBanner />)
    goOffline()
    expect(screen.getByRole('status')).toHaveTextContent(/buttons that save are switched off/i)
    goOnline()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('a real form: Punch / Apply style actions cannot be sent offline', async () => {
    mockSession(employee)
    server.use(http.get(`${BASE}/leaves`, () => HttpResponse.json(list([]))))
    renderApp('/leaves')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Apply for leave' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Apply for leave' }))
    expect(dialog.getByRole('button', { name: 'Send request' })).toBeEnabled()
    goOffline()
    expect(dialog.getByRole('button', { name: 'Send request' })).toBeDisabled()
    expect(dialog.getByRole('button', { name: 'Cancel' })).toBeEnabled() // you can still back out
    goOnline()
  })
})

describe('opening the installed app without a connection', () => {
  it('shows "can\'t reach the server" - not the login page - and carries on by itself when the connection returns', async () => {
    let reachable = false
    server.use(
      http.get(`${BASE}/config`, () => HttpResponse.json({ company_timezone: 'Asia/Kolkata', utc_offset_minutes: 330, today: '2026-03-05' })),
      http.get(`${BASE}/auth/me`, () => (reachable ? HttpResponse.json(employee) : HttpResponse.error())),
      http.get(`${BASE}/permissions/me`, () => HttpResponse.json({ role: 'employee', unrestricted: false, role_defaults: [], grants: [] })),
    )
    server.use(http.get(`${BASE}/tasks`, () => HttpResponse.json(list([]))), http.get(`${BASE}/leaves`, () => HttpResponse.json(list([]))), http.get(`${BASE}/attendance`, () => HttpResponse.json(list([]))), http.get(`${BASE}/service-calls`, () => HttpResponse.json(list([]))), http.get(`${BASE}/notifications`, () => HttpResponse.json({ items: [], total: 0 })), http.get(`${BASE}/customers`, () => HttpResponse.json(list([]))), http.get(`${BASE}/machines`, () => HttpResponse.json(list([]))), http.get(`${BASE}/attachments`, () => HttpResponse.json({ items: [] })), http.get(`${BASE}/projects`, () => HttpResponse.json(list([]))), http.get(`${BASE}/eod`, () => HttpResponse.json(list([]))))
    renderApp('/tasks')
    expect(await screen.findByRole('heading', { name: "Can't reach the server" })).toBeInTheDocument()
    expect(screen.getByText(/You are still signed in/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /welcome to opsflow/i })).not.toBeInTheDocument() // not the sign-in page

    reachable = true
    goOnline() // the browser says the connection is back: no click needed
    expect(await screen.findByRole('heading', { level: 1, name: /My tasks/ })).toBeInTheDocument()
  })

  it('offers a Try again button too, and says "offline" when the browser knows it is', async () => {
    let reachable = false
    server.use(
      http.get(`${BASE}/config`, () => HttpResponse.json({ company_timezone: 'Asia/Kolkata', utc_offset_minutes: 330, today: '2026-03-05' })),
      http.get(`${BASE}/auth/me`, () => (reachable ? HttpResponse.json(employee) : HttpResponse.error())),
    )
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    renderApp('/tasks')
    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument()
    reachable = true
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: "You're offline" })).not.toBeInTheDocument())
  })

  it('a failing server (5xx) on startup is also "can\'t reach the server", not a sign-out', async () => {
    server.use(
      http.get(`${BASE}/config`, () => HttpResponse.json({ company_timezone: 'Asia/Kolkata', utc_offset_minutes: 330, today: '2026-03-05' })),
      http.get(`${BASE}/auth/me`, () => new HttpResponse('Bad gateway', { status: 502 })),
    )
    renderApp('/tasks')
    expect(await screen.findByRole('heading', { name: "Can't reach the server" })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /welcome to opsflow/i })).not.toBeInTheDocument()
  })

  it('a rejected sign-in (401) is still the login page - only an unreachable server is different', async () => {
    mockSession(null)
    renderApp('/tasks')
    expect(await screen.findByRole('heading', { name: /welcome to opsflow/i })).toBeInTheDocument()
  })
})

describe('a failed refresh keeps what was already on screen', () => {
  it('after a change that succeeded, a failed re-load keeps showing the earlier list with a note and a retry', async () => {
    mockSession(employee)
    let fail = false
    const row = { id: 'l-1', employee_id: employee.id, start_date: '2026-03-10', end_date: '2026-03-12', reason: 'Family function', status: 'pending', current_approver_id: null, created_at: '2026-03-04T05:00:00Z', updated_at: '2026-03-04T05:00:00Z' }
    server.use(
      http.get(`${BASE}/leaves`, () => (fail ? HttpResponse.error() : HttpResponse.json(list([row])))),
      http.post(`${BASE}/leaves/l-1/cancel`, () => HttpResponse.json({ ...row, status: 'cancelled' })),
    )
    renderApp('/leaves')
    const user = userEvent.setup()
    expect(await screen.findByText('Family function')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel request' }))
    fail = true // the cancel will go through, but the list that follows cannot be loaded
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel request' }))
    expect(await screen.findByText(/this is what was loaded earlier/, undefined, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getByText('Family function')).toBeInTheDocument() // the data is still there
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText(/this is what was loaded earlier/)).not.toBeInTheDocument())
  }, 20000)
})

describe('installing', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  it('recognises iPhone / iPad Safari, which can only install from the Share menu', () => {
    expect(isIosSafari(iphone, 5)).toBe(true)
    expect(isIosSafari('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 5)).toBe(true) // iPad in desktop mode
    expect(isIosSafari('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 0)).toBe(false) // a real Mac
    expect(isIosSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1', 5)).toBe(false) // Chrome on iOS
    expect(isIosSafari('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36', 5)).toBe(false)
  })
})
