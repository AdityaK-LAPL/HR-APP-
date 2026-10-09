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

import { formatDuration, inclusiveDays, shiftDate } from './dates'

describe('date arithmetic helpers', () => {
  it('formats durations', () => {
    expect(formatDuration(485)).toBe('8h 05m')
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(null)).toBe('')
  })
  it('counts inclusive days across month ends', () => {
    expect(inclusiveDays('2026-03-05', '2026-03-05')).toBe(1)
    expect(inclusiveDays('2026-02-27', '2026-03-02')).toBe(4)
  })
  it('shifts calendar dates', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
  })
})

import { companyLocalToIso, isoToCompanyLocal } from './dates'

describe('company-local <-> UTC conversion for datetime-local inputs', () => {
  it('treats typed times as IST', () => {
    expect(companyLocalToIso('2026-03-05T09:30')).toBe('2026-03-05T04:00:00.000Z')
    expect(companyLocalToIso('2026-03-05T00:15')).toBe('2026-03-04T18:45:00.000Z')
  })
  it('round-trips', () => {
    expect(isoToCompanyLocal('2026-03-05T04:00:00.000Z')).toBe('2026-03-05T09:30')
    expect(isoToCompanyLocal(companyLocalToIso('2026-12-31T23:59'))).toBe('2026-12-31T23:59')
  })
  it('ignores empty or invalid input', () => {
    expect(companyLocalToIso('')).toBe('')
    expect(isoToCompanyLocal(null)).toBe('')
  })
})
