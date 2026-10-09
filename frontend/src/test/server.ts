import { setupServer } from 'msw/node'

/** Test-only API double. Production code never imports this (and no mock mode exists in the app). */
export const server = setupServer()
