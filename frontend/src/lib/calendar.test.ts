import { describe, expect, it } from 'vitest'
import { addDays, addMonths, monthEnd, monthGrid, monthLabel, monthOf, monthStart, weekdayIndex } from './calendar'

describe('calendar maths', () => {
  it('adds days across month and year ends and in leap years', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('moves between months', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-03', 0)).toBe('2026-03')
    expect(monthOf('2026-03-05')).toBe('2026-03')
  })

  it('knows month bounds and labels', () => {
    expect(monthStart('2026-02')).toBe('2026-02-01')
    expect(monthEnd('2026-02')).toBe('2026-02-28')
    expect(monthEnd('2028-02')).toBe('2028-02-29')
    expect(monthEnd('2026-12')).toBe('2026-12-31')
    expect(monthLabel('2026-03')).toBe('March 2026')
  })

  it('numbers weekdays from Monday', () => {
    expect(weekdayIndex('2026-03-02')).toBe(0) // Monday
    expect(weekdayIndex('2026-03-08')).toBe(6) // Sunday
  })

  it('lays a month out in whole Monday-first weeks', () => {
    const weeks = monthGrid('2026-03') // 1 March 2026 is a Sunday
    expect(weeks.every((week) => week.length === 7)).toBe(true)
    expect(weeks[0]?.[0]).toBe('2026-02-23')
    expect(weeks[0]?.[6]).toBe('2026-03-01')
    expect(weeks.at(-1)?.[6]).toBe('2026-04-05')
    expect(weeks.flat()).toContain('2026-03-31')
  })
})
