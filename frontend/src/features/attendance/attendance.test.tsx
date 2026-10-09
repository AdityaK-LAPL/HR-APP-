import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BASE, apiError, employee, mockSession } from '@/test/api'
import { day, list, spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

function stubGeolocation(result: 'ok' | 'denied') {
  const getCurrentPosition = vi.fn((success: PositionCallback, failure: PositionErrorCallback) => {
    if (result === 'ok') {
      success({ coords: { latitude: 12.97161234, longitude: 77.59461234 } } as GeolocationPosition)
    } else {
      failure({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3, POSITION_UNAVAILABLE: 2, message: 'denied' } as GeolocationPositionError)
    }
  })
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  return getCurrentPosition
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation')
})

function mockToday(item: ReturnType<typeof day> | null) {
  server.use(
    http.get(`${BASE}/attendance`, ({ request }) => {
      const params = new URL(request.url).searchParams
      const isToday = params.get('start_date') === '2026-03-05' && params.get('end_date') === '2026-03-05'
      return HttpResponse.json(list(item && isToday ? [item] : item ? [item] : []))
    }),
  )
}

describe('Attendance', () => {
  it('punches in with the location read once at that moment, then shows the working state', async () => {
    mockSession(employee)
    const geo = stubGeolocation('ok')
    const seen = spy()
    let state: ReturnType<typeof day> | null = null
    server.use(
      http.get(`${BASE}/attendance`, () => HttpResponse.json(list(state ? [state] : []))),
      http.post(`${BASE}/attendance/punch-in`, async ({ request }) => {
        await seen.record(request)
        state = day()
        return HttpResponse.json(state)
      }),
    )
    renderApp('/attendance')
    expect(await screen.findByText(/haven.t punched in yet/i)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Punch in' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(geo).toHaveBeenCalledTimes(1)
    expect(seen.seen[0]?.body).toEqual({ latitude: 12.971612, longitude: 77.594612 })
    expect(await screen.findByText(/punched in at/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Punch out' })).toBeInTheDocument()
  })

  it('still punches in when location is denied, and says the location was not recorded', async () => {
    mockSession(employee)
    stubGeolocation('denied')
    const seen = spy()
    server.use(http.post(`${BASE}/attendance/punch-in`, async ({ request }) => {
      await seen.record(request)
      return HttpResponse.json(day())
    }))
    renderApp('/attendance')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Punch in' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toEqual({ latitude: null, longitude: null })
    expect(await screen.findByText(/location permission was denied/i)).toBeInTheDocument()
  })

  it('does not ask for location when the user opts out', async () => {
    mockSession(employee)
    const geo = stubGeolocation('ok')
    const seen = spy()
    server.use(http.post(`${BASE}/attendance/punch-in`, async ({ request }) => { await seen.record(request); return HttpResponse.json(day()) }))
    renderApp('/attendance')
    const user = userEvent.setup()
    await user.click(await screen.findByLabelText(/record my location/i))
    await user.click(screen.getByRole('button', { name: 'Punch in' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(geo).not.toHaveBeenCalled()
    expect(seen.seen[0]?.body).toEqual({ latitude: null, longitude: null })
  })

  it('confirms before punching out, then shows the finished day', async () => {
    mockSession(employee)
    stubGeolocation('ok')
    let state = day()
    server.use(
      http.get(`${BASE}/attendance`, () => HttpResponse.json(list([state]))),
      http.post(`${BASE}/attendance/punch-out`, () => {
        state = day({ punch_out_time: '2026-03-05T12:00:00Z', total_duration_minutes: 510 })
        return HttpResponse.json(state)
      }),
    )
    renderApp('/attendance')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Punch out' }))
    const dialog = await screen.findByRole('dialog', { name: 'Punch out for today?' })
    expect(within(dialog).getByText(/won.t be able to punch in again/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Punch out' }))
    expect(await screen.findByText(/day complete/i)).toBeInTheDocument()
    expect(screen.getByText(/8h 30m worked/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Punch out' })).not.toBeInTheDocument()
  })

  it('shows the server message if the punch is refused (e.g. already punched in)', async () => {
    mockSession(employee)
    stubGeolocation('ok')
    server.use(http.post(`${BASE}/attendance/punch-in`, () => apiError(409, 'conflict', 'You are already punched in for today.')))
    renderApp('/attendance')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Punch in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You are already punched in for today.')
  })

  it('lists attendance history in company time and shows the punches of a day', async () => {
    mockSession(employee)
    mockToday(day({ punch_out_time: '2026-03-05T12:00:00Z', total_duration_minutes: 510 }))
    server.use(
      http.get(`${BASE}/attendance/${employee.id}/2026-03-05/events`, () =>
        HttpResponse.json([
          { id: 'ev1', user_id: employee.id, event_type: 'punch_in', event_time: '2026-03-05T03:30:00Z', latitude: 12.9, longitude: 77.5, location_label: '12.9,77.5' },
        ]),
      ),
    )
    renderApp('/attendance')
    const table = within(await screen.findByRole('table'))
    expect(await table.findByText('09:00 am')).toBeInTheDocument() // 03:30Z = 09:00 IST
    expect(table.getByText('8h 30m')).toBeInTheDocument()
    await userEvent.setup().click(table.getByRole('button', { name: /show punches on 05 mar 2026/i }))
    const dialog = await screen.findByRole('dialog', { name: /punches on 05 mar 2026/i })
    expect(await within(dialog).findByText('Punched in')).toBeInTheDocument()
    expect(within(dialog).getByText(/12\.9,77\.5/)).toBeInTheDocument()
  })
})
