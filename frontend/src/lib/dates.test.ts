import { afterEach, describe, expect, it } from 'vitest'
import {
  companyDateOf,
  companyToday,
  formatDate,
  formatDateTime,
  formatTime,
  setCompanyTimezone,
} from './dates'

afterEach(() => setCompanyTimezone('Asia/Kolkata'))

describe('company-timezone dates', () => {
  it('rolls the date over at IST midnight, not UTC midnight', () => {
    expect(companyDateOf('2026-03-01T18:29:00Z')).toBe('2026-03-01') // 23:59 IST
    expect(companyDateOf('2026-03-01T18:30:00Z')).toBe('2026-03-02') // 00:00 IST
    expect(companyToday(new Date('2026-03-01T19:00:00Z'))).toBe('2026-03-02')
  })

  it('formats timestamps in the company timezone', () => {
    expect(formatTime('2026-03-02T03:30:00Z')).toMatch(/09:00/) // 09:00 IST
    expect(formatDateTime('2026-03-02T03:30:00Z')).toMatch(/02 Mar 2026/)
  })

  it('follows a different configured timezone', () => {
    setCompanyTimezone('America/New_York')
    expect(companyDateOf('2026-03-02T03:30:00Z')).toBe('2026-03-01')
  })

  it('formats calendar dates without shifting them', () => {
    expect(formatDate('2026-03-05')).toBe('05 Mar 2026')
  })

  it('returns an empty string for missing or invalid input', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime('not a date')).toBe('')
    expect(formatDate('')).toBe('')
    expect(formatTime(undefined)).toBe('')
  })
})
