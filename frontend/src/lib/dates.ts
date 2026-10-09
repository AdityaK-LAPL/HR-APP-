/**
 * Date/time policy: the API sends UTC instants and company-calendar dates (YYYY-MM-DD).
 * Everything is DISPLAYED in the company timezone (GET /config, Asia/Kolkata by default),
 * never the browser's, so every user sees the same attendance day. "Today" for a form
 * default is the company's today, not `new Date()` in the browser.
 */

let companyTimezone = 'Asia/Kolkata'

export function setCompanyTimezone(timezone: string): void {
  companyTimezone = timezone
}

export function getCompanyTimezone(): string {
  return companyTimezone
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()
function formatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cacheKey = `${companyTimezone}|${key}`
  let cached = formatterCache.get(cacheKey)
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-IN', { timeZone: companyTimezone, ...options })
    formatterCache.set(cacheKey, cached)
  }
  return cached
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

/** "05 Mar 2026, 02:30 pm" in the company timezone. Empty string for null/invalid input. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatter('datetime', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatter('time', { hour: '2-digit', minute: '2-digit' }).format(date)
}

/** A calendar date such as "2026-03-05" (no timezone conversion: it is already a company date). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return ''
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** The company-calendar date (YYYY-MM-DD) of an instant, in the company timezone. */
export function companyDateOf(value: string | Date): string {
  const parts = formatter('ymd', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(toDate(value))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Today in the company timezone, for default values of date inputs. */
export function companyToday(now: Date = new Date()): string {
  return companyDateOf(now)
}
