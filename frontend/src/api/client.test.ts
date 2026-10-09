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
