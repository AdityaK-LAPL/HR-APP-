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

/** 485 -> "8h 05m"; null/undefined -> "". */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return ''
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours > 0 ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${rest}m`
}

/** Whole days from `fromDate` to `toDate` (both YYYY-MM-DD), inclusive: same day = 1. */
export function inclusiveDays(fromDate: string, toDate: string): number {
  const ms = Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)
  return Math.round(ms / 86_400_000) + 1
}

/** `YYYY-MM-DD` n days before the given date (calendar arithmetic, no timezone involved). */
export function shiftDate(date: string, days: number): string {
  const moved = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
  return moved.toISOString().slice(0, 10)
}

function companyOffsetMinutes(at: Date): number {
  const parts = formatter('offset', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asIfUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
}

/** What a <input type="datetime-local"> holds ("2026-03-05T09:30") is company-local time -> UTC ISO instant. */
export function companyLocalToIso(local: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!match) return ''
  const [, y, mo, d, h, mi] = match
  const asIfUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi))
  const offset = companyOffsetMinutes(new Date(asIfUtc))
  return new Date(asIfUtc - offset * 60_000).toISOString()
}

/** A UTC instant -> the value for <input type="datetime-local"> in company time. */
export function isoToCompanyLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = formatter('local', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
