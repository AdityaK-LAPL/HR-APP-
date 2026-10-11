import { HttpResponse, http } from 'msw'
import type { Schema } from '@/api/types'
import { BASE, employee, manager } from './api'
import { server } from './server'

export const list = <T>(items: T[], extra: Record<string, unknown> = {}) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 20,
  ...extra,
})

export const task = (over: Partial<Schema<'TaskResponse'>> = {}): Schema<'TaskResponse'> => ({
  id: 't-1',
  title: 'Calibrate press line 3',
  description: 'Check tolerances before the shift.',
  project_id: null,
  assigned_to: employee.id,
  assigned_by: manager.id,
  priority: 'high',
  status: 'not_started',
  task_date: '2026-03-05',
  due_date: '2026-03-06',
  created_at: '2026-03-04T05:00:00Z',
  updated_at: '2026-03-04T05:00:00Z',
  ...over,
})

export const leave = (over: Partial<Schema<'LeaveResponse'>> = {}): Schema<'LeaveResponse'> => ({
  id: 'l-1',
  employee_id: employee.id,
  start_date: '2026-03-10',
  end_date: '2026-03-12',
  reason: 'Family function',
  status: 'pending',
  current_approver_id: manager.id,
  created_at: '2026-03-04T05:00:00Z',
  updated_at: '2026-03-04T05:00:00Z',
  ...over,
})

export const day = (over: Partial<Schema<'AttendanceDayResponse'>> = {}): Schema<'AttendanceDayResponse'> => ({
  id: 'a-1',
  user_id: employee.id,
  work_date: '2026-03-05',
  punch_in_time: '2026-03-05T03:30:00Z',
  punch_in_location: '12.9716,77.5946',
  punch_out_time: null,
  punch_out_location: null,
  total_duration_minutes: null,
  status: 'present',
  ...over,
})

export const call = (over: Partial<Schema<'ServiceCallResponse'>> = {}): Schema<'ServiceCallResponse'> => ({
  id: 'c-1',
  service_call_code: 'SC-1042',
  customer_id: 'cust-1',
  machine_id: 'mach-1',
  reported_by_contact_id: null,
  contacted_at: '2026-03-05T04:00:00Z',
  contact_method: 'phone',
  issue_reported: 'Spindle vibrates above 3000 rpm',
  priority: 'urgent',
  service_type: 'field_visit',
  responsible_manager_id: manager.id,
  status: 'assigned',
  resolution: null,
  created_at: '2026-03-05T04:00:00Z',
  updated_at: '2026-03-05T04:00:00Z',
  ...over,
})

/** Everything an employee screen may fetch, answering "nothing here" unless a test overrides it. */
export function mockEmployeeData() {
  server.use(
    http.get(`${BASE}/tasks`, () => HttpResponse.json(list([]))),
    http.get(`${BASE}/leaves`, () => HttpResponse.json(list([]))),
    http.get(`${BASE}/eod`, () => HttpResponse.json(list([]))),
    http.get(`${BASE}/projects`, () => HttpResponse.json(list([]))),
    http.get(`${BASE}/attendance`, () => HttpResponse.json(list([]))),
    http.get(`${BASE}/service-calls`, () => HttpResponse.json(list([]))),
    http.get(`${BASE}/attachments`, () => HttpResponse.json({ items: [] })),
    http.get(`${BASE}/notifications`, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(`${BASE}/customers`, () => HttpResponse.json(list([]))),
    http.get(`${BASE}/machines`, () => HttpResponse.json(list([]))),
  )
}

export const person = (over: Partial<Schema<'UserResponse'>> = {}): Schema<'UserResponse'> => ({
  id: employee.id,
  employee_code: 'EMP001',
  name: 'Erin Employee',
  designation: 'Service Engineer',
  role: 'employee',
  manager_id: manager.id,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

/** What a manager's screens fetch beyond the employee data: nothing here unless a test says so. */
export function mockManagerData() {
  server.use(
    http.get(`${BASE}/users`, () => HttpResponse.json(list([]))),
    http.get(`${BASE}/users/:id/subordinates`, () => HttpResponse.json([])),
    http.get(`${BASE}/hierarchy`, () => HttpResponse.json([])),
    http.get(`${BASE}/calendar`, () => HttpResponse.json({ items: [] })),
    http.get(`${BASE}/reports/workload`, () => HttpResponse.json([])),
    http.get(`${BASE}/reports/attendance`, () => HttpResponse.json([])),
    http.get(`${BASE}/permissions/grants`, () => HttpResponse.json([])),
    http.get(`${BASE}/permissions/definitions`, () => HttpResponse.json([])),
    http.get(`${BASE}/audit-logs`, () => HttpResponse.json(list([]))),
    http.get(`${BASE}/reports/tasks`, () => HttpResponse.json({ by_status: [], total: 0 })),
    http.get(`${BASE}/reports/leave`, () => HttpResponse.json({ by_status: [], total: 0 })),
    http.get(`${BASE}/reports/service-activity`, () =>
      HttpResponse.json({ by_status: [], total_calls: 0, average_resolution_minutes: null }),
    ),
  )
}

/** Record the last request a handler saw (url + parsed JSON body). */
export function spy() {
  const seen: { url: URL; body: unknown; headers: Headers }[] = []
  return {
    seen,
    async record(request: Request) {
      let body: unknown = null
      try {
        body = await request.clone().json()
      } catch {
        // no JSON body
      }
      seen.push({ url: new URL(request.url), body, headers: request.headers })
    },
  }
}
