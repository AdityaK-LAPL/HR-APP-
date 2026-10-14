/**
 * The only module that talks to the backend.
 *
 * - Same-origin `/api/v1` (Vite proxies it in development); cookies carry the session, so the
 *   JavaScript never sees a token.
 * - CSRF: mutating requests echo the readable `csrf_token` cookie in `X-CSRF-Token`.
 * - 401 -> ONE shared `POST /auth/refresh` (single-flight so parallel requests don't rotate the
 *   refresh token twice - within a tab, and across tabs through the Web Locks API where available),
 *   then the original request is retried once. The retry also happens when the refresh itself was
 *   refused: another tab may have rotated the cookie a moment earlier, in which case the request
 *   now succeeds. Only a request that is still 401 runs the registered session-expired handler
 *   (AuthProvider sends the user to the login page).
 * - Failures become `ApiError`; a request that never reaches the server is `status 0`.
 */

import { ApiError, errorFromResponse, networkError } from './errors'

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api/v1'
const TIMEOUT_MS = 30_000
export const OFFLINE_MESSAGE = "You're offline. Reconnect to save this change - nothing was sent."

type QueryValue = string | number | boolean | null | undefined
export type Query = Record<string, QueryValue | readonly QueryValue[]>

export interface RequestOptions {
  query?: Query
  body?: unknown
  form?: FormData
  signal?: AbortSignal
  /** Do not attempt a session refresh on 401 (used by the auth endpoints themselves). */
  skipRefresh?: boolean
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
const MUTATING: ReadonlySet<Method> = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

let onSessionExpired: (() => void) | null = null
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler
}

export function readCsrfToken(cookie: string = document.cookie): string | null {
  const match = /(?:^|;\s*)csrf_token=([^;]+)/.exec(cookie)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? (value as readonly QueryValue[]) : [value as QueryValue]
    for (const item of values) {
      if (item !== undefined && item !== null && item !== '') params.append(key, String(item))
    }
  }
  const text = params.toString()
  return text ? `${url}?${text}` : url
}

let refreshInFlight: Promise<boolean> | null = null

async function callRefresh(): Promise<boolean> {
  try {
    await send('POST', '/auth/refresh', { skipRefresh: true })
    return true
  } catch {
    return false
  }
}

/**
 * One refresh at a time; every concurrent 401 awaits the same promise. The refresh token rotates
 * on use, so two tabs refreshing with the same cookie at once would make the second fail and sign
 * the user out - the lock makes the second tab wait and then use the cookie the first one set.
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
      return locks ? await locks.request('opsflow-session-refresh', callRefresh) : await callRefresh()
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

async function send(method: Method, path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: BodyInit | undefined
  if (options.form) {
    body = options.form // the browser sets the multipart boundary
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  if (MUTATING.has(method)) {
    const csrf = readCsrfToken()
    if (csrf) headers['X-CSRF-Token'] = csrf
  }

  // Abort on timeout or when the caller's signal fires (e.g. navigation cancels a query).
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const onCallerAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onCallerAbort)

  try {
    const response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body,
      credentials: 'include',
      signal: controller.signal,
    })
    return response
  } catch (error) {
    if (options.signal?.aborted) throw error // the caller cancelled; not a failure to report
    throw networkError(
      controller.signal.aborted ? 'The server took too long to respond.' : undefined,
    )
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onCallerAbort)
  }
}

const mutationsInFlight = new Map<string, Promise<unknown>>()

/**
 * A change that is already on its way is not sent a second time: a double-click, a double-tap or
 * Enter plus a click arrive as two identical requests before the first has answered, and would
 * otherwise create two leave requests, two tasks and so on. Both callers share the one response.
 * (Uploads are exempt - each is its own file.)
 */
export function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  if (!MUTATING.has(method) || options.form) return perform<T>(method, path, options)
  const key = `${method} ${buildUrl(path, options.query)} ${JSON.stringify(options.body ?? null)}`
  const running = mutationsInFlight.get(key)
  if (running) return running as Promise<T>
  const call = perform<T>(method, path, options).finally(() => mutationsInFlight.delete(key))
  mutationsInFlight.set(key, call)
  return call
}

async function perform<T>(method: Method, path: string, options: RequestOptions): Promise<T> {
  // A change is never attempted - or queued for later - without a connection: the person is told
  // instead, and decides again when they are back online. (`navigator.onLine` is only a hint, so
  // a failure while it says "online" is still reported as a network error by `send`.)
  if (MUTATING.has(method) && typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw networkError(OFFLINE_MESSAGE)
  }
  const response = await sendWithRefresh(method, path, options)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** One request, with the shared session refresh on 401; a failed answer becomes an `ApiError`. */
async function sendWithRefresh(method: Method, path: string, options: RequestOptions): Promise<Response> {
  let response = await send(method, path, options)

  if (response.status === 401 && !options.skipRefresh) {
    // Retry even if our own refresh was refused: another tab may have rotated the cookie first.
    await refreshSession()
    response = await send(method, path, options)
    if (response.status === 401) {
      onSessionExpired?.()
    }
  }

  if (!response.ok) throw await errorFromResponse(response)
  return response
}

export interface DownloadedFile {
  blob: Blob
  /** The server's suggested name (from Content-Disposition), if it sent one. */
  filename: string | null
}

/** The file name the server asked for: RFC 5987 `filename*` first, then the plain `filename`. */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      // fall through to the plain form
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)
  return plain?.[1]?.trim() || null
}

async function downloadFile(path: string, options: RequestOptions = {}): Promise<DownloadedFile> {
  const response = await sendWithRefresh('GET', path, options)
  return { blob: await response.blob(), filename: filenameFromDisposition(response.headers.get('Content-Disposition')) }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
  upload: <T>(path: string, form: FormData, options?: RequestOptions) =>
    request<T>('POST', path, { ...options, form }),
  /** A file (e.g. an .xlsx report) as a Blob plus the name the server suggested. */
  download: (path: string, options?: RequestOptions) => downloadFile(path, options),
}

export { ApiError }
