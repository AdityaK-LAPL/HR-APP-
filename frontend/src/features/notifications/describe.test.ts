import { describe, expect, it } from 'vitest'
import { ago, factsOf, humanize, messageOf, targetOf, titleOf } from './describe'

const id = '0b2d6f1e-3c4a-4b8e-9d1f-7a5c3e2b1a09'
const n = (payload: Record<string, unknown> | null) => ({ payload }) as { payload: Record<string, unknown> | null }

describe('notification wording', () => {
  it('turns free-text types into readable titles', () => {
    expect(humanize('task_assigned')).toBe('Task assigned')
    expect(humanize('leave.approved')).toBe('Leave approved')
    expect(humanize('service-call-created')).toBe('Service call created')
    expect(titleOf({ type: 'custom_event' })).toBe('Custom event')
  })

  it('takes a message from message, title or body, in that order', () => {
    expect(messageOf(n({ message: 'Hello', title: 'T' }))).toBe('Hello')
    expect(messageOf(n({ title: 'T', body: 'B' }))).toBe('T')
    expect(messageOf(n({ body: 'B' }))).toBe('B')
    expect(messageOf(n({ message: '  ' }))).toBeNull()
    expect(messageOf(n({ message: 5 }))).toBeNull()
    expect(messageOf(n(null))).toBeNull()
  })

  it('lists simple facts only, hiding what is shown elsewhere or only steers navigation', () => {
    const facts = factsOf(n({ message: 'm', entity_type: 'task', entity_id: id, task_title: 'Calibrate', priority: 'high', count: 3, ok: true, nested: { a: 1 }, list: [1] }))
    expect(facts).toEqual([
      { key: 'task_title', label: 'Task title', value: 'Calibrate' },
      { key: 'priority', label: 'Priority', value: 'high' },
      { key: 'count', label: 'Count', value: '3' },
      { key: 'ok', label: 'Ok', value: 'true' },
    ])
  })
})

describe('where a notification points', () => {
  const t = (type: unknown, entityId: unknown = id, role: 'owner' | 'manager' | 'employee' = 'manager') => targetOf(n({ entity_type: type, entity_id: entityId }), role)

  it('follows only the explicit entity_type + entity_id convention', () => {
    expect(t('task')).toEqual({ to: `/tasks/${id}`, label: 'Open the task' })
    expect(t('project')?.to).toBe(`/projects/${id}`)
    expect(t('service_call')?.to).toBe(`/service/${id}`)
    expect(t('eod_report')?.to).toBe(`/eod/${id}`)
    expect(t('customer')?.to).toBe(`/customers/${id}`)
    expect(t('machine')?.to).toBe(`/machines/${id}`)
    expect(t('leave_request')?.to).toBe('/leaves?status=all')
  })

  it('never guesses: unknown kinds, malformed ids, missing keys and other shapes give no link', () => {
    expect(t('banana')).toBeNull()
    expect(t('task', 'not-a-uuid')).toBeNull()
    expect(t('task', 42)).toBeNull()
    expect(t(undefined)).toBeNull()
    expect(targetOf(n(null), 'manager')).toBeNull()
    expect(targetOf(n({ task_id: id }), 'manager')).toBeNull()
    expect(targetOf(n({ url: '/tasks/' + id }), 'manager')).toBeNull()
    expect(t('task', `${id}/../../x`)).toBeNull() // no path tricks
  })

  it('points to a person only for staff', () => {
    expect(t('user', id, 'owner')?.to).toBe(`/users/${id}`)
    expect(t('user', id, 'manager')?.to).toBe(`/users/${id}`)
    expect(t('user', id, 'employee')).toBeNull()
  })
})

describe('relative time', () => {
  const now = Date.parse('2026-03-05T10:00:00Z')
  const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString()
  it('reads naturally and defers to the date after two days', () => {
    expect(ago(at(5), now)).toBe('just now')
    expect(ago(at(5 * 60), now)).toBe('5 min ago')
    expect(ago(at(3 * 3600), now)).toBe('3 h ago')
    expect(ago(at(30 * 3600), now)).toBe('yesterday')
    expect(ago(at(72 * 3600), now)).toBeNull()
    expect(ago(at(-120), now)).toBe('just now') // a clock slightly ahead never shows "in the future"
  })
})
