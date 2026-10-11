import type { Role } from '@/api/types'
import type { Notification } from './queries'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "task_assigned" / "leave.approved" -> "Task assigned" / "Leave approved". The backend's `type` is free text. */
export function humanize(text: string): string {
  const spaced = text.replace(/[._-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function titleOf(notification: Pick<Notification, 'type'>): string {
  return humanize(notification.type)
}

type Primitive = string | number | boolean
const isPrimitive = (value: unknown): value is Primitive => ['string', 'number', 'boolean'].includes(typeof value)

/** A sentence to show: the payload's `message`, `title` or `body` when it has a text one. */
export function messageOf(notification: Pick<Notification, 'payload'>): string | null {
  const payload = notification.payload
  if (!payload) return null
  const found = [payload.message, payload.title, payload.body].find((value): value is string => typeof value === 'string' && value.trim().length > 0)
  return found ?? null
}

/** Everything simple the payload carries, minus the keys that only steer navigation or are already shown. */
export function factsOf(notification: Pick<Notification, 'payload'>): { key: string; label: string; value: string }[] {
  const payload = notification.payload
  if (!payload) return []
  const hidden = new Set(['message', 'title', 'body', 'entity_type', 'entity_id'])
  return Object.entries(payload)
    .filter(([key, value]) => !hidden.has(key) && isPrimitive(value))
    .map(([key, value]) => ({ key, label: humanize(key), value: String(value) }))
}

export interface Target {
  to: string
  label: string
}

/**
 * Where a notification points, IF it says so. The backend does not produce notifications yet and
 * has not fixed a payload shape, so the UI follows one explicit convention and nothing else:
 * `payload.entity_type` (one of the record kinds the API already uses for attachments and the audit
 * trail) plus `payload.entity_id` (a UUID). Anything else gets no link - a notification is never
 * guessed into a destination.
 */
export function targetOf(notification: Pick<Notification, 'payload'>, role: Role): Target | null {
  const payload = notification.payload
  const type = payload?.entity_type
  const id = payload?.entity_id
  if (typeof type !== 'string' || typeof id !== 'string' || !UUID.test(id)) return null
  switch (type) {
    case 'task':
      return { to: `/tasks/${id}`, label: 'Open the task' }
    case 'project':
      return { to: `/projects/${id}`, label: 'Open the project' }
    case 'service_call':
      return { to: `/service/${id}`, label: 'Open the service call' }
    case 'eod_report':
      return { to: `/eod/${id}`, label: 'Open the report' }
    case 'customer':
      return { to: `/customers/${id}`, label: 'Open the customer' }
    case 'machine':
      return { to: `/machines/${id}`, label: 'Open the machine' }
    case 'leave_request':
      return { to: '/leaves?status=all', label: 'Open leave requests' }
    case 'user':
      return role === 'employee' ? null : { to: `/users/${id}`, label: 'Open the person' }
    default:
      return null
  }
}

/** "just now", "5 min ago", "3 h ago", "yesterday"; older than that the caller shows the date. */
export function ago(iso: string, now: number = Date.now()): string | null {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  if (hours < 48) return 'yesterday'
  return null
}
