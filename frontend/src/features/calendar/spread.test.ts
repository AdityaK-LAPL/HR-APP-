import { describe, expect, it } from 'vitest'
import { spreadLeave, type CalendarEntry, type CalendarLeave } from './queries'

const entry = (over: Partial<CalendarEntry>): CalendarEntry => ({ entry_date: '2026-03-04', entry_type: 'leave', user_id: 'u1', title: 'Leave (approved)', status: 'approved', ...over }) as CalendarEntry
const leave = (over: Partial<CalendarLeave>): CalendarLeave => ({ id: 'l', employee_id: 'u1', start_date: '2026-03-04', end_date: '2026-03-06', reason: null, status: 'approved', current_approver_id: null, created_at: '', updated_at: '', ...over }) as CalendarLeave
const days = (list: CalendarEntry[]) => list.map((e) => e.entry_date)

describe('spreadLeave', () => {
  it('spreads a leave over each day it covers', () => {
    expect(days(spreadLeave([entry({})], [leave({})], '2026-03-01', '2026-03-31'))).toEqual(['2026-03-04', '2026-03-05', '2026-03-06'])
  })

  it('clips to the visible range, both ends', () => {
    expect(days(spreadLeave([entry({})], [leave({ end_date: '2026-03-10' })], '2026-03-01', '2026-03-05'))).toEqual(['2026-03-04', '2026-03-05'])
    expect(days(spreadLeave([entry({ entry_date: '2026-02-27' })], [leave({ start_date: '2026-02-27', end_date: '2026-03-03' })], '2026-03-01', '2026-03-31'))).toEqual(['2026-03-01', '2026-03-02', '2026-03-03'])
  })

  it('leaves tasks alone and keeps an unmatched leave on its own day', () => {
    const task = entry({ entry_type: 'task', title: 'Plan' })
    expect(spreadLeave([task], [leave({})], '2026-03-01', '2026-03-31')).toEqual([task])
    expect(days(spreadLeave([entry({ user_id: 'someone-else' })], [leave({})], '2026-03-01', '2026-03-31'))).toEqual(['2026-03-04'])
    expect(days(spreadLeave([entry({ status: 'pending' })], [leave({})], '2026-03-01', '2026-03-31'))).toEqual(['2026-03-04']) // different status: not the same request
  })

  it('crosses a month end correctly', () => {
    expect(days(spreadLeave([entry({ entry_date: '2026-03-30' })], [leave({ start_date: '2026-03-30', end_date: '2026-04-02' })], '2026-03-01', '2026-03-31'))).toEqual(['2026-03-30', '2026-03-31'])
  })
})
