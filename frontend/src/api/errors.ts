/** One normalised error for everything the API client can fail with. */

export type FieldErrors = Record<string, string>

interface ErrorBody {
  error?: {
    code?: string
    message?: string
    details?: { field?: string; message?: string; type?: string }[]
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: FieldErrors
  readonly requestId: string | undefined

  constructor(init: {
    status: number
    code: string
    message: string
    fieldErrors?: FieldErrors
    requestId?: string
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.fieldErrors = init.fieldErrors ?? {}
    this.requestId = init.requestId
  }

  /** The request never reached the server (offline, DNS, CORS, timeout). */
  get isNetworkError(): boolean {
    return this.status === 0
  }

  /** The API deliberately answers 404 for records the caller may not see, so treat both alike. */
  get isNotAvailable(): boolean {
    return this.status === 403 || this.status === 404
  }

  get isPasswordChangeRequired(): boolean {
    return this.code === 'password_change_required'
  }
}

export function networkError(message = 'Cannot reach the server. Check your connection.'): ApiError {
  return new ApiError({ status: 0, code: 'network_error', message })
}

/** Build an ApiError from a failed Response (body is `{error: {code, message, details?}}`). */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  let body: ErrorBody | null = null
  try {
    body = (await response.json()) as ErrorBody
  } catch {
    // not JSON (proxy error page, etc.)
  }
  const fieldErrors: FieldErrors = {}
  for (const detail of body?.error?.details ?? []) {
    if (detail.field && detail.message && !(detail.field in fieldErrors)) {
      fieldErrors[detail.field] = detail.message
    }
  }
  return new ApiError({
    status: response.status,
    code: body?.error?.code ?? `http_${response.status}`,
    message: body?.error?.message ?? `The request failed (HTTP ${response.status}).`,
    fieldErrors,
    requestId: response.headers.get('X-Request-ID') ?? undefined,
  })
}
