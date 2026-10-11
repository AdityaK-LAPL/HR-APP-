import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './errors'

/** GET queries retry network/5xx errors twice; never 4xx (the answer won't change) and never mutations. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false
  if (error instanceof ApiError) return error.isNetworkError || error.status >= 500
  return false
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        // Offline, a request should fail at once and say so (with a Retry), not hang as an endless
        // skeleton; when the connection returns, stale or failed queries refetch by themselves.
        networkMode: 'always',
      },
      // Never queue a change to replay later: a save is either sent now or refused (see the API client).
      mutations: { retry: false, networkMode: 'always' },
    },
  })
}
