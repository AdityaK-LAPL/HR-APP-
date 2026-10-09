import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { applyApiError } from './forms'

const make = (code: string, fieldErrors = {}, status = 422) =>
  new ApiError({ status, code, message: `server says ${code}`, fieldErrors })

describe('applyApiError', () => {
  it('puts field errors on their fields and returns nothing for the banner', () => {
    const setError = vi.fn()
    const message = applyApiError(make('validation_failed', { priority: 'bad' }), setError, ['priority'])
    expect(setError).toHaveBeenCalledWith('priority', { type: 'server', message: 'bad' })
    expect(message).toBeNull()
  })

  it('returns a banner message when a field error has no matching field', () => {
    const setError = vi.fn()
    const message = applyApiError(make('validation_failed', { ghost: 'x' }), setError, ['priority'])
    expect(setError).not.toHaveBeenCalled()
    expect(message).toBe('server says validation_failed')
  })

  it('uses the server message for business-rule errors and a friendly one for rate limits', () => {
    const setError = vi.fn()
    expect(applyApiError(make('conflict', {}, 409), setError, [])).toBe('server says conflict')
    expect(applyApiError(make('rate_limit_exceeded', {}, 429), setError, [])).toMatch(/Too many attempts/)
  })

  it('has a safe default for non-API errors', () => {
    expect(applyApiError(new Error('boom'), vi.fn(), [])).toMatch(/Something went wrong/)
  })
})
