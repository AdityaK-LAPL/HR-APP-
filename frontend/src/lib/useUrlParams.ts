import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * List state (page, filters) lives in the URL: shareable, survives reload, and Back/Forward work.
 * Changing any filter resets to page 1.
 */
export function useUrlParams<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams()

  const values = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [key, params.get(key) ?? fallback]),
  ) as T

  const set = useCallback(
    (patch: Partial<T>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === '' || value === defaults[key]) next.delete(key)
            else next.set(key, value)
          }
          if (!('page' in patch)) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    // `defaults` is a fresh object each render; its keys never change for a given screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams],
  )

  return [values, set] as const
}

export function pageNumber(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}
