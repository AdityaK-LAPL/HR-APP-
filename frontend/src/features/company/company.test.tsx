import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Schema } from '@/api/types'
import { BASE, apiError, employee, manager, mockSession, owner } from '@/test/api'
import { spy } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'
import { filenameFromDisposition } from '@/api/client'
import { safeFilename } from '@/lib/download'

const ERIN = '33333333-3333-4333-8333-333333333333'
const SAM = '44444444-4444-4444-8444-444444444444'

const analytics = (): Schema<'AttendanceAnalyticsResponse'> => ({
  month: '2026-03',
  first_day: '2026-03-01',
  last_day: '2026-03-31',
  employees: 2,
  working_days: 4,
  average_attendance_percent: 87.5,
  average_minutes_per_day: 510,
  late_arrivals: 3,
  leave_days: 1.5,
  by_type: [
    { code: 'At Office', meaning: 'Worked from the office', count: 5 },
    { code: 'Absent', meaning: 'No punch and no leave', count: 2 },
    { code: 'WFH', meaning: 'Worked from home', count: 0 },
  ],
  daily: [
    { date: '2026-03-01', weekly_off: true, holiday: false, at_office: 0, work_from_home: 0, on_duty: 0, weekend_or_holiday_working: 0, on_leave: 0, comp_off: 0, absent: 0 },
    { date: '2026-03-02', weekly_off: false, holiday: false, at_office: 2, work_from_home: 0, on_duty: 0, weekend_or_holiday_working: 0, on_leave: 0, comp_off: 0, absent: 0 },
  ],
  people: [
    { user_id: ERIN, name: 'Erin Employee', employee_code: 'EMP001', days_worked: 3, at_office: 3, work_from_home: 0, on_duty: 0, weekend_or_holiday_working: 0, leave_days: 0.5, comp_off: 0, absent: 0, total_minutes: 1530, average_minutes: 510, late_count: 1, average_in_minute: 582 },
    { user_id: SAM, name: 'Sam Support', employee_code: 'EMP002', days_worked: 2, at_office: 2, work_from_home: 0, on_duty: 0, weekend_or_holiday_working: 0, leave_days: 1, comp_off: 0, absent: 2, total_minutes: 1020, average_minutes: 510, late_count: 2, average_in_minute: null },
  ],
})

const leaveAnalytics = (): Schema<'LeaveAnalyticsResponse'> => ({
  financial_year: 2025,
  first_day: '2025-04-01',
  last_day: '2026-03-31',
  total_leave_days: 4.5,
  taken_days: 3.5,
  upcoming_days: 1,
  by_month: [{ month: '2026-03', leave_days: 4.5, full_days: 4, half_days: 1, comp_off_days: 0 }],
  people: [{ user_id: ERIN, name: 'Erin Employee', employee_code: 'EMP001', leave_days: 4.5, full_days: 4, half_days: 1, comp_off_days: 0, upcoming_days: 1 }],
})

function mockAnalytics() {
  const calls = spy()
  server.use(
    http.get(`${BASE}/reports/attendance-analytics`, async ({ request }) => {
      await calls.record(request)
      return HttpResponse.json(analytics())
    }),
    http.get(`${BASE}/reports/leave-analytics`, () => HttpResponse.json(leaveAnalytics())),
  )
  return calls
}

function allowReports() {
  server.use(
    http.get(`${BASE}/permissions/me`, () =>
      HttpResponse.json({
        role: 'manager',
        unrestricted: false,
        role_defaults: [],
        grants: [{ permission_key: 'download_company_reports', scope_type: 'global', scope_id: null, effect: 'allow', expires_at: null }],
      }),
    ),
  )
}

describe('file name helpers', () => {
  it('reads the name the server suggested, preferring the UTF-8 form', () => {
    expect(filenameFromDisposition('attachment; filename="DayReport_2026-03-05.xlsx"')).toBe('DayReport_2026-03-05.xlsx')
    expect(filenameFromDisposition("attachment; filename=\"x.xlsx\"; filename*=UTF-8''Attendance_Zo%C3%AB_March_2026.xlsx")).toBe('Attendance_Zoë_March_2026.xlsx')
    expect(filenameFromDisposition(null)).toBeNull()
  })
  it('never lets a name escape the downloads folder', () => {
    expect(safeFilename('../../etc/passwd', 'f.xlsx')).toBe('_.._etc_passwd')
    expect(safeFilename('a/b\\c:d.xlsx', 'f.xlsx')).toBe('a_b_c_d.xlsx')
    expect(safeFilename('   ', 'f.xlsx')).toBe('f.xlsx')
  })
})

describe('Attendance analytics', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:report')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined) // jsdom cannot navigate
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the Owner the month at a glance, per employee, with the leave position', async () => {
    mockSession(owner)
    mockAnalytics()
    renderApp('/attendance-analytics')
    expect(await screen.findByRole('heading', { name: 'Attendance analytics' })).toBeInTheDocument()
    expect(await screen.findByText('88%')).toBeInTheDocument() // 87.5 rounded
    expect(screen.getByText('Late arrivals').previousElementSibling).toHaveTextContent('3')
    const table = await screen.findByRole('table', { name: 'Attendance per employee in March 2026' })
    expect(within(table).getByRole('row', { name: /Erin Employee \(EMP001\).*9:42|Erin Employee/ })).toBeInTheDocument()
    expect(within(table).getByRole('row', { name: /Sam Support/ })).toBeInTheDocument()
    expect(await screen.findByRole('figure', { name: /Leave days by month/ })).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'People working each day in March 2026' })).toBeInTheDocument()
    // The pie-free breakdown leaves out types nobody had.
    expect(screen.queryByText(/WFH · Worked from home/)).not.toBeInTheDocument()
  })

  it('asks for another month when the picker changes', async () => {
    mockSession(owner)
    const calls = mockAnalytics()
    renderApp('/attendance-analytics')
    await screen.findByRole('table', { name: /Attendance per employee/ })
    await userEvent.setup().selectOptions(screen.getByLabelText('Month'), '2026-02')
    await waitFor(() => expect(calls.seen.some((c) => c.url.href.includes('month=2026-02'))).toBe(true))
  })

  it('downloads the daily report and says so', async () => {
    mockSession(owner)
    mockAnalytics()
    const asked = spy()
    server.use(
      http.get(`${BASE}/reports/exports/attendance-daily`, async ({ request }) => {
        await asked.record(request)
        return new HttpResponse(new Uint8Array([80, 75, 3, 4]), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="DayReport_2026-03-05.xlsx"',
          },
        })
      }),
    )
    renderApp('/attendance-analytics')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Daily report' }))
    expect(await screen.findByText('DayReport_2026-03-05.xlsx downloaded.')).toBeInTheDocument()
    expect(asked.seen[0]?.url.href).toContain('date=2026-03-05')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('needs an employee before the personal reports, and then asks for that employee and month', async () => {
    mockSession(owner)
    mockAnalytics()
    const asked = spy()
    server.use(
      http.get(`${BASE}/reports/exports/attendance-monthly`, async ({ request }) => {
        await asked.record(request)
        return new HttpResponse(new Uint8Array([1]), { headers: { 'Content-Disposition': 'attachment; filename="Attendance_Erin_Employee_March_2026.xlsx"' } })
      }),
      http.get(`${BASE}/reports/exports/leave-card`, async ({ request }) => {
        await asked.record(request)
        return new HttpResponse(new Uint8Array([1]), { headers: { 'Content-Disposition': 'attachment; filename="LeaveCard_Erin_Employee.xlsx"' } })
      }),
    )
    renderApp('/attendance-analytics')
    const user = userEvent.setup()
    const monthly = await screen.findByRole('button', { name: 'Monthly attendance' })
    expect(monthly).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Leave card' })).toBeDisabled()
    await screen.findByRole('option', { name: 'Erin Employee (EMP001)' })
    await user.selectOptions(screen.getByLabelText('Employee'), ERIN)
    await user.click(monthly)
    await screen.findByText('Attendance_Erin_Employee_March_2026.xlsx downloaded.')
    expect(asked.seen[0]?.url.href).toContain(`employee_id=${ERIN}`)
    expect(asked.seen[0]?.url.href).toContain('month=2026-03')
    await user.click(screen.getByRole('button', { name: 'Leave card' }))
    await screen.findByText('LeaveCard_Erin_Employee.xlsx downloaded.')
    expect(asked.seen[1]?.url.href).toContain('start_date=2025-04-01')
    expect(asked.seen[1]?.url.href).toContain('end_date=2026-03-31')
  })

  it('reports a refused or failed download instead of saving an empty file', async () => {
    mockSession(owner)
    mockAnalytics()
    server.use(http.get(`${BASE}/reports/exports/attendance-summary`, () => apiError(403, 'authorization_failed', 'You are not allowed to download company reports.')))
    renderApp('/attendance-analytics')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Monthly summary (everyone)' }))
    expect(await screen.findByText('You are not allowed to download company reports.')).toBeInTheDocument()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('opens for a manager the Owner allowed, and lists it in their menu', async () => {
    mockSession(manager)
    allowReports()
    mockAnalytics()
    renderApp('/attendance-analytics')
    expect(await screen.findByRole('table', { name: /Attendance per employee/ })).toBeInTheDocument()
    const menus = screen.getAllByRole('navigation', { name: 'Main menu' })
    expect(within(menus[0] as HTMLElement).getByRole('link', { name: 'Attendance analytics' })).toBeInTheDocument()
  })

  it('tells a plain manager it is not theirs - and never asks the server for the figures', async () => {
    mockSession(manager)
    const calls = mockAnalytics()
    renderApp('/attendance-analytics')
    expect(await screen.findByText(/has not allowed you to download company attendance reports/i)).toBeInTheDocument()
    expect(calls.seen).toHaveLength(0)
    const menu = screen.getAllByRole('navigation', { name: 'Main menu' })[0] as HTMLElement
    expect(within(menu).queryByRole('link', { name: 'Attendance analytics' })).not.toBeInTheDocument()
  })

  it('is not an employee screen', async () => {
    mockSession(employee)
    renderApp('/attendance-analytics')
    expect(await screen.findByText(/not available/i)).toBeInTheDocument()
  })
})

describe('Company settings', () => {
  const settings = { company_name: 'Laser Automation', weekly_off_days: [5, 6], late_after: '09:30:00' }

  it('saves the weekly off, company name and late time', async () => {
    mockSession(owner)
    const seen = spy()
    server.use(
      http.get(`${BASE}/company/settings`, () => HttpResponse.json(settings)),
      http.get(`${BASE}/company/holidays`, () => HttpResponse.json([])),
      http.patch(`${BASE}/company/settings`, async ({ request }) => {
        await seen.record(request)
        return HttpResponse.json({ ...settings, weekly_off_days: [6], late_after: '10:00:00' })
      }),
    )
    renderApp('/company-settings')
    const user = userEvent.setup()
    expect(await screen.findByLabelText(/^Company name/)).toHaveValue('Laser Automation')
    expect(screen.getByLabelText('Sat')).toBeChecked()
    expect(screen.getByLabelText('Sun')).toBeChecked()
    expect(screen.getByLabelText('Mon')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled() // nothing changed yet
    await user.click(screen.getByLabelText('Sat'))
    const late = screen.getByLabelText(/Late after/)
    await user.clear(late)
    await user.type(late, '10:00')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toEqual({ company_name: 'Laser Automation', weekly_off_days: [6], late_after: '10:00' })
    expect(await screen.findByText('Company settings saved.')).toBeInTheDocument()
  })

  it('adds a holiday, and removes one only after a confirmation', async () => {
    mockSession(owner)
    const added = spy()
    const removed = spy()
    let holidays = [{ id: 'h1', holiday_date: '2026-01-26', name: 'Republic Day', is_active: true }]
    server.use(
      http.get(`${BASE}/company/settings`, () => HttpResponse.json(settings)),
      http.get(`${BASE}/company/holidays`, () => HttpResponse.json(holidays)),
      http.post(`${BASE}/company/holidays`, async ({ request }) => {
        await added.record(request)
        const created = { id: 'h2', holiday_date: '2026-03-14', name: 'Holi', is_active: true }
        holidays = [...holidays, created]
        return HttpResponse.json(created, { status: 201 })
      }),
      http.delete(`${BASE}/company/holidays/:id`, async ({ request }) => {
        await removed.record(request)
        holidays = holidays.filter((holiday) => !request.url.endsWith(holiday.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/company-settings')
    const user = userEvent.setup()
    expect(await screen.findByText('Republic Day')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^Date/), '2026-03-14')
    await user.type(screen.getByLabelText(/Holiday name/), 'Holi')
    await user.click(screen.getByRole('button', { name: 'Add holiday' }))
    await waitFor(() => expect(added.seen).toHaveLength(1))
    expect(added.seen[0]?.body).toEqual({ holiday_date: '2026-03-14', name: 'Holi' })
    expect(await screen.findByText('Holi')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove Republic Day' }))
    expect(removed.seen).toHaveLength(0) // asked first
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Remove holiday' }))
    await waitFor(() => expect(removed.seen).toHaveLength(1))
    await waitFor(() => expect(screen.queryByText('Republic Day')).not.toBeInTheDocument())
  })

  it('is the Owner\'s screen only', async () => {
    mockSession(manager)
    renderApp('/company-settings')
    expect(await screen.findByText(/not available/i)).toBeInTheDocument()
  })
})
