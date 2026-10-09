import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server'

// jsdom has no <dialog> modal support; model just enough of it for the Dialog component.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

// jsdom has no matchMedia. Model `(min-width: Npx)` against window.innerWidth (jsdom: 1024, a
// desktop layout); a test can set `window.innerWidth = 390` before rendering to get the phone layout.
window.matchMedia ??= ((query: string) => {
  const min = /min-width:\s*(\d+)px/.exec(query)
  return {
    matches: min ? window.innerWidth >= Number(min[1]) : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  } as unknown as MediaQueryList
}) as typeof window.matchMedia

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  window.innerWidth = 1024
  server.resetHandlers()
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})
afterAll(() => server.close())
