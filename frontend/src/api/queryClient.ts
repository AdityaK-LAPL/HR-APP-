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
      },
      mutations: { retry: false },
    },
  })
}
