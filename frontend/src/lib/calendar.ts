/**
 * Calendar-date arithmetic on `YYYY-MM-DD` strings. Pure string/UTC maths: no browser timezone is
 * involved, so "the 5th" is the 5th in company time wherever the browser is.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const pad = (n: number) => String(n).padStart(2, '0')

function toUtc(iso: string): Date {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function fromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return fromUtc(date)
}

/** `YYYY-MM` of a date. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7)
}

export function addMonths(month: string, delta: number): string {
  const [year = 1970, m = 1] = month.split('-').map(Number)
  const index = year * 12 + (m - 1) + delta
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

export function monthStart(month: string): string {
  return `${month}-01`
}

export function monthEnd(month: string): string {
  return addDays(monthStart(addMonths(month, 1)), -1)
}

/** "March 2026" */
export function monthLabel(month: string): string {
  const [year, m = 1] = month.split('-')
  return `${MONTHS[m === undefined ? 0 : Number(m) - 1] ?? ''} ${year}`
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(iso: string): number {
  return (toUtc(iso).getUTCDay() + 6) % 7
}

/** Weeks (Monday first) that cover the month, including the neighbouring days that fill the first/last week. */
export function monthGrid(month: string): string[][] {
  const first = monthStart(month)
  const gridStart = addDays(first, -weekdayIndex(first))
  const last = monthEnd(month)
  const gridEnd = addDays(last, 6 - weekdayIndex(last))
  const weeks: string[][] = []
  for (let day = gridStart; day <= gridEnd; ) {
    const week: string[] = []
    for (let i = 0; i < 7; i += 1) {
      week.push(day)
      day = addDays(day, 1)
    }
    weeks.push(week)
  }
  return weeks
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10))
}
