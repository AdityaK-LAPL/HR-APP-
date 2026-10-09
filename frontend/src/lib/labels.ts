/**
 * Human wording and badge colour for every enum the API returns. The value sets come from the
 * generated API types (so a new backend value is a compile error here, not a silent blank badge);
 * wording is presentation only.
 */

import type { Schema } from '@/api/types'

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
interface Entry {
  label: string
  tone: Tone
}
type Table<V extends string> = Record<V, Entry>

type TaskStatus = Schema<'TaskResponse'>['status']
type Priority = Schema<'TaskResponse'>['priority']
type LeaveStatus = Schema<'LeaveResponse'>['status']
type ProjectStatus = Schema<'ProjectResponse'>['status']
type ServiceStatus = Schema<'ServiceCallResponse'>['status']
type AttendanceStatus = Schema<'AttendanceDayResponse'>['status']
type MachineStatus = Schema<'MachineResponse'>['status']
type VisitType = Schema<'ServiceVisitResponse'>['visit_type']
type ServiceType = Schema<'ServiceCallResponse'>['service_type']
type ContactMethod = Schema<'ServiceCallResponse'>['contact_method']

export const TASK_STATUS: Table<TaskStatus> = {
  not_started: { label: 'Not started', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'info' },
  blocked: { label: 'Blocked', tone: 'danger' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export const PRIORITY: Table<Priority> = {
  low: { label: 'Low', tone: 'neutral' },
  medium: { label: 'Medium', tone: 'info' },
  high: { label: 'High', tone: 'warning' },
  urgent: { label: 'Urgent', tone: 'danger' },
}

export const LEAVE_STATUS: Table<LeaveStatus> = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export const PROJECT_STATUS: Table<ProjectStatus> = {
  not_started: { label: 'Not started', tone: 'neutral' },
  planning: { label: 'Planning', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info' },
  on_hold: { label: 'On hold', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export const SERVICE_STATUS: Table<ServiceStatus> = {
  new: { label: 'New', tone: 'warning' },
  assigned: { label: 'Assigned', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info' },
  waiting_customer: { label: 'Waiting for customer', tone: 'warning' },
  waiting_parts: { label: 'Waiting for parts', tone: 'warning' },
  remote_support: { label: 'Remote support', tone: 'info' },
  field_visit_scheduled: { label: 'Field visit scheduled', tone: 'info' },
  field_visit_completed: { label: 'Field visit completed', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
  reopened: { label: 'Reopened', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export const ATTENDANCE_STATUS: Table<AttendanceStatus> = {
  present: { label: 'Present', tone: 'success' },
  partial: { label: 'Partial', tone: 'warning' },
  absent: { label: 'Absent', tone: 'danger' },
  on_leave: { label: 'On leave', tone: 'neutral' },
}

export const MACHINE_STATUS: Table<MachineStatus> = {
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
  decommissioned: { label: 'Decommissioned', tone: 'danger' },
}

export const VISIT_TYPE: Record<VisitType, string> = {
  field_visit: 'Field visit',
  online_support: 'Online support',
}

export const SERVICE_TYPE: Record<ServiceType, string> = {
  online_support: 'Online support',
  phone_support: 'Phone support',
  remote_support: 'Remote support',
  field_visit: 'Field visit',
  other: 'Other',
}

export const CONTACT_METHOD: Record<ContactMethod, string> = {
  phone: 'Phone',
  email: 'Email',
  in_person: 'In person',
  other: 'Other',
}

/** Options for a <select>, in the order the table lists them. */
export function optionsOf<V extends string>(table: Record<V, Entry | string>): { value: V; label: string }[] {
  return (Object.keys(table) as V[]).map((value) => {
    const entry = table[value]
    return { value, label: typeof entry === 'string' ? entry : entry.label }
  })
}

export function labelOf(table: Record<string, Entry | string>, value: string | null | undefined): string {
  if (!value) return ''
  const entry = table[value]
  if (entry === undefined) return value.replace(/_/g, ' ')
  return typeof entry === 'string' ? entry : entry.label
}

export function toneOf(table: Record<string, Entry>, value: string): Tone {
  return table[value]?.tone ?? 'neutral'
}
