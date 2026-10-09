import { useSyncExternalStore } from 'react'

/** Reactive `window.matchMedia`. Defaults to `false` where matchMedia does not exist (tests). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window.matchMedia !== 'function') return () => undefined
      const list = window.matchMedia(query)
      list.addEventListener('change', callback)
      return () => list.removeEventListener('change', callback)
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false),
    () => false,
  )
}
