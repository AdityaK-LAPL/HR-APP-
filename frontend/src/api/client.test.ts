import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/server'
import { BASE, apiError } from '@/test/api'
import { api, buildUrl, readCsrfToken, setSessionExpiredHandler } from './client'
import { ApiError } from './errors'

afterEach(() => setSessionExpiredHandler(null))

describe('request building', () => {
  it('repeats array query params and skips empty values', () => {
    expect(buildUrl('/users/directory', { ids: ['a', 'b'], page: 2, q: '', x: undefined })).toBe(
      `${BASE}/users/directory?ids=a&ids=b&page=2`,
    )
  })

  it('reads the csrf cookie', () => {
    expect(readCsrfToken('a=1; csrf_token=abc%20def; b=2')).toBe('abc def')
    expect(readCsrfToken('a=1')).toBeNull()
  })
})

describe('platform errors', () => {
  it('explains a 413 from the hosting platform (no JSON body) as a too-large file', async () => {
    server.use(http.post(`${BASE}/attachments`, () => new HttpResponse('Request Entity Too Large', { status: 413 })))
    const error = await api.upload('/attachments', new FormData()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(413)
    expect((error as ApiError).message).toMatch(/too large/i)
  })
})

describe('CSRF', () => {
  it('echoes the csrf cookie on mutating requests only', async () => {
    document.cookie = 'csrf_token=tok123'
    const seen: Record<string, string | null> = {}
    server.use(
      http.get(`${BASE}/thing`, ({ request }) => {
        seen.get = request.headers.get('X-CSRF-Token')
        return HttpResponse.json({})
      }),
      http.post(`${BASE}/thing`, ({ request }) => {
        seen.post = request.headers.get('X-CSRF-Token')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await api.get('/thing')
    await api.post('/thing', { a: 1 })
    expect(seen).toEqual({ get: null, post: 'tok123' })
  })
})

describe('double submits', () => {
  it('sends an identical change that is already in flight only once, and shares its answer', async () => {
    let hits = 0
    server.use(
      http.post(`${BASE}/leaves`, async () => {
        hits += 1
        await new Promise((resolve) => setTimeout(resolve, 30))
        return HttpResponse.json({ id: 'L1' }, { status: 201 })
      }),
    )
    const [first, second] = await Promise.all([api.post('/leaves', { reason: 'x' }), api.post('/leaves', { reason: 'x' })])
    expect(hits).toBe(1)
    expect(second).toEqual(first)
    // once answered, the same change may be sent again; a different change is never merged
    await api.post('/leaves', { reason: 'x' })
    await Promise.all([api.post('/leaves', { reason: 'x' }), api.post('/leaves', { reason: 'y' })])
    expect(hits).toBe(4)
  })

  it('never merges reads', async () => {
    let hits = 0
    server.use(http.get(`${BASE}/thing`, () => { hits += 1; return HttpResponse.json({}) }))
    await Promise.all([api.get('/thing'), api.get('/thing')])
    expect(hits).toBe(2)
  })
})

describe('errors', () => {
  it('maps the API error shape, including per-field details and the request id', async () => {
    server.use(
      http.post(`${BASE}/tasks`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_failed',
              message: 'The request contained invalid data.',
              details: [{ field: 'priority', message: 'bad value', type: 'literal_error' }],
            },
          },
          { status: 422, headers: { 'X-Request-ID': 'req-1' } },
        ),
      ),
    )
    const error = await api.post('/tasks', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      code: 'validation_failed',
      fieldErrors: { priority: 'bad value' },
      requestId: 'req-1',
    })
  })

  it('treats 403 and 404 alike as "not available"', async () => {
    server.use(
      http.get(`${BASE}/a`, () => apiError(403, 'forbidden', 'no')),
      http.get(`${BASE}/b`, () => apiError(404, 'not_found', 'no')),
    )
    for (const path of ['/a', '/b']) {
      const error = (await api.get(path).catch((e: unknown) => e)) as ApiError
      expect(error.isNotAvailable).toBe(true)
    }
  })

  it('recognises the forced-password-change error', async () => {
    server.use(http.get(`${BASE}/x`, () => apiError(403, 'password_change_required', 'change it')))
    const error = (await api.get('/x').catch((e: unknown) => e)) as ApiError
    expect(error.isPasswordChangeRequired).toBe(true)
  })

  it('reports an unreachable server as a network error (status 0)', async () => {
    server.use(http.get(`${BASE}/down`, () => HttpResponse.error()))
    const error = (await api.get('/down').catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.isNetworkError).toBe(true)
  })

  it('returns undefined for 204', async () => {
    server.use(http.post(`${BASE}/n`, () => new HttpResponse(null, { status: 204 })))
    expect(await api.post('/n')).toBeUndefined()
  })
})

describe('session refresh', () => {
  it('refreshes ONCE for parallel 401s, then retries each request', async () => {
    let refreshes = 0
    let authorised = false
    server.use(
      http.post(`${BASE}/auth/refresh`, () => {
        refreshes += 1
        authorised = true
        return HttpResponse.json({})
      }),
      http.get(`${BASE}/data/:id`, ({ params }) =>
        authorised
          ? HttpResponse.json({ id: params.id })
          : apiError(401, 'authentication_failed', 'Not authenticated.'),
      ),
    )
    const results = await Promise.all([api.get('/data/1'), api.get('/data/2'), api.get('/data/3')])
    expect(results).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }])
    expect(refreshes).toBe(1)
  })

  it('ends the session when the refresh itself fails', async () => {
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    server.use(
      http.get(`${BASE}/data`, () => apiError(401, 'authentication_failed', 'Not authenticated.')),
      http.post(`${BASE}/auth/refresh`, () => apiError(401, 'authentication_failed', 'expired')),
    )
    const error = (await api.get('/data').catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(401)
    expect(expired).toHaveBeenCalledTimes(1)
  })

  it('does not sign the user out when its refresh is refused but another tab already rotated the cookie', async () => {
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    let rotated = false
    server.use(
      // our refresh uses a token the other tab just rotated -> refused ...
      http.post(`${BASE}/auth/refresh`, () => {
        rotated = true // ... but the cookie jar now holds the other tab's fresh session
        return apiError(401, 'authentication_failed', 'Refresh token already used.')
      }),
      http.get(`${BASE}/data`, () => (rotated ? HttpResponse.json({ ok: true }) : apiError(401, 'authentication_failed', 'Not authenticated.'))),
    )
    await expect(api.get('/data')).resolves.toEqual({ ok: true })
    expect(expired).not.toHaveBeenCalled()
  })

  it('serialises refreshes across tabs with a Web Lock when the browser has one', async () => {
    const order: string[] = []
    const locks = {
      request: vi.fn(async (name: string, callback: () => Promise<boolean>) => {
        order.push(`lock:${name}`)
        const result = await callback()
        order.push('unlock')
        return result
      }),
    }
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true })
    let authorised = false
    server.use(
      http.post(`${BASE}/auth/refresh`, () => {
        order.push('refresh')
        authorised = true
        return HttpResponse.json({})
      }),
      http.get(`${BASE}/data`, () => (authorised ? HttpResponse.json({ ok: true }) : apiError(401, 'authentication_failed', 'x'))),
    )
    try {
      await api.get('/data')
    } finally {
      Reflect.deleteProperty(navigator, 'locks')
    }
    expect(order).toEqual(['lock:opsflow-session-refresh', 'refresh', 'unlock'])
  })

  it('never refreshes for calls marked skipRefresh (a wrong password is not an expired session)', async () => {
    let refreshes = 0
    server.use(
      http.post(`${BASE}/auth/login`, () => apiError(401, 'authentication_failed', 'Invalid.')),
      http.post(`${BASE}/auth/refresh`, () => {
        refreshes += 1
        return HttpResponse.json({})
      }),
    )
    await api.post('/auth/login', {}, { skipRefresh: true }).catch(() => undefined)
    expect(refreshes).toBe(0)
  })
})
