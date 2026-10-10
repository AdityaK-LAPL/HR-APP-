/** Wording for the audit trail. Presentation only: the action strings come from the backend. */

export const AUDIT_ACTIONS: Record<string, string> = {
  'user.created': 'User created',
  'user.modified': 'User changed',
  'user.deactivated': 'User deactivated',
  'user.manager_changed': 'Manager changed',
  'user.password_reset': 'Password reset by an administrator',
  'user.password_changed': 'Password changed',
  'user.account_locked': 'Account locked after failed sign-ins',
  'task.created': 'Task created',
  'task.reassigned': 'Task reassigned',
  'task.status_changed': 'Task status changed',
  'project.created': 'Project created',
  'project.modified': 'Project changed',
  'project.archived': 'Project archived',
  'project.member_added': 'Project member added',
  'project.member_removed': 'Project member removed',
  'permission.granted': 'Permission granted',
  'permission.revoked': 'Permission revoked',
  'service_call.created': 'Service call created',
  'service_call.employee_assigned': 'Employee assigned to a service call',
  'service_call.status_changed': 'Service call status changed',
  'service_report.submitted': 'Service report submitted',
  'leave.approved': 'Leave approved',
  'leave.rejected': 'Leave rejected',
}

export const AUDIT_ENTITY_TYPES: Record<string, string> = {
  user: 'Person',
  task: 'Task',
  project: 'Project',
  leave_request: 'Leave request',
  service_call: 'Service call',
  service_report: 'Service report',
  permission_grant: 'Permission',
}

export function actionLabel(action: string): string {
  const known = AUDIT_ACTIONS[action]
  if (known) return known
  const text = action.replace(/[._]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function entityLabel(type: string): string {
  return AUDIT_ENTITY_TYPES[type] ?? type.replace(/_/g, ' ')
}

/** Where the record lives in the app, when there is a screen for it. */
export function entityPath(type: string, id: string | null): string | null {
  if (!id) return null
  switch (type) {
    case 'user':
      return `/users/${id}`
    case 'task':
      return `/tasks/${id}`
    case 'project':
      return `/projects/${id}`
    case 'service_call':
      return `/service/${id}`
    case 'permission_grant':
      return '/permissions'
    case 'leave_request':
      return '/leaves?status=all'
    default:
      return null
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
