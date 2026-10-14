/**
 * How the Owner's permission screen talks about the permissions the backend defines.
 *
 * Wording is presentation only. The *shape* of each permission - which scope it takes and whether
 * "deny" means anything - mirrors what the server actually evaluates (see docs/permissions.md and
 * `has_permission` / `app_visible_user_ids`), so the screen never offers a combination that does
 * nothing or that the backend does not support. A permission the backend defines but this file does
 * not know is listed read-only; it is never offered for creation.
 */

export type ScopeKind = 'global' | 'manager' | 'project'
export type Effect = 'allow' | 'deny'

export interface PermissionUi {
  key: string
  label: string
  group: 'Manager visibility' | 'Assignment' | 'Projects' | 'Company reports'
  scope: ScopeKind
  /** Wording for the thing the scope picks ("the manager whose team ..."). */
  scopeLabel: string
  /** `deny` is offered only where the server gives it an effect the default would not already have. */
  effects: readonly Effect[]
  help: string
}

export const PERMISSION_UI: readonly PermissionUi[] = [
  {
    key: 'view_manager_team',
    label: 'See another manager\'s team',
    group: 'Manager visibility',
    scope: 'manager',
    scopeLabel: 'Manager whose team they may see',
    effects: ['allow', 'deny'],
    help: 'Allow: the manager can see that manager and their whole branch as people (read-only). Deny: removes that person and their branch from what the manager sees, even inside their own reporting line.',
  },
  {
    key: 'view_manager_reports',
    label: 'See another manager\'s reports',
    group: 'Manager visibility',
    scope: 'manager',
    scopeLabel: 'Manager whose reports they may see',
    effects: ['allow', 'deny'],
    help: 'Allow: the manager can read the tasks, EOD reports and attendance of that manager\'s whole branch (read-only). Deny: hides that branch\'s tasks, EOD and attendance, even inside their own reporting line.',
  },
  {
    key: 'view_subordinate_manager_calendar',
    label: 'See another manager\'s team calendar',
    group: 'Manager visibility',
    scope: 'manager',
    scopeLabel: 'Manager whose calendar they may see',
    effects: ['allow', 'deny'],
    help: 'Allow: that manager\'s branch appears in the team calendar (the entries must also be readable). Deny: leaves that branch out of the calendar.',
  },
  {
    key: 'assign_tasks_to_manager',
    label: 'Assign tasks to another manager',
    group: 'Assignment',
    scope: 'manager',
    scopeLabel: 'Manager they may assign tasks to',
    effects: ['allow'],
    help: 'The manager can create and assign tasks for that other manager. Without it, a manager can assign only to themself and their own reporting line.',
  },
  {
    key: 'assign_employees_to_service_call',
    label: 'Assign people to another manager\'s service calls',
    group: 'Assignment',
    scope: 'manager',
    scopeLabel: 'Responsible manager whose calls they may staff',
    effects: ['allow'],
    help: 'The manager can assign and remove employees on service calls whose responsible manager is the one chosen.',
  },
  {
    key: 'create_project',
    label: 'Create projects',
    group: 'Projects',
    scope: 'global',
    scopeLabel: '',
    effects: ['allow', 'deny'],
    help: 'Managers may create projects by default. A deny stops one manager from creating new projects.',
  },
  {
    key: 'modify_project',
    label: 'Edit a project they do not own',
    group: 'Projects',
    scope: 'project',
    scopeLabel: 'Project',
    effects: ['allow'],
    help: 'The manager can edit that project\'s details and status. Owning managers can always edit their own projects.',
  },
  {
    key: 'assign_employees_to_project',
    label: 'Add or remove people on a project they do not own',
    group: 'Projects',
    scope: 'project',
    scopeLabel: 'Project',
    effects: ['allow'],
    help: 'The manager can add and remove project members. Owning managers can always manage their own project\'s members.',
  },
  {
    key: 'delete_archive_project',
    label: 'Archive a project',
    group: 'Projects',
    scope: 'project',
    scopeLabel: 'Project',
    effects: ['allow'],
    help: 'The manager can archive that project. Archiving always needs this permission, even for the project\'s own manager.',
  },
  {
    key: 'download_company_reports',
    label: 'Download company attendance reports',
    group: 'Company reports',
    scope: 'global',
    scopeLabel: '',
    effects: ['allow'],
    help: 'Typically the HR person. Opens the Attendance analytics page and the Excel downloads (monthly attendance of any employee, the daily report of everyone, leave cards, the monthly summary) for the WHOLE company, read-only. It does not widen what the manager sees anywhere else.',
  },
]

export const PERMISSION_BY_KEY = new Map(PERMISSION_UI.map((entry) => [entry.key, entry]))

export function permissionLabel(key: string): string {
  return PERMISSION_BY_KEY.get(key)?.label ?? key.replace(/_/g, ' ')
}

export const SCOPE_TYPE_FOR: Record<ScopeKind, 'global' | 'user' | 'project'> = {
  global: 'global',
  manager: 'user',
  project: 'project',
}
