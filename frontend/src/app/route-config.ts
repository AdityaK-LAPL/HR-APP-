/**
 * Single source for the app's routes AND its navigation.
 *
 * `roles` is a display hint (what to show in menus, and a friendly "not available" screen if the
 * wrong role types the URL). It is NOT access control: the API decides, and answers 403/404.
 * `phase` is the delivery prompt that replaces the placeholder with the real screen.
 */

import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  CheckSquare,
  Clock,
  Cpu,
  FileText,
  History,
  LayoutDashboard,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/api/types'

export const ALL_ROLES: readonly Role[] = ['owner', 'manager', 'employee']

export type NavSection = 'Workspace' | 'Service' | 'Insights' | 'Administration'

export interface RouteSpec {
  path: string
  title: string
  icon: LucideIcon
  section: NavSection
  roles: readonly Role[]
  /** Per-role menu wording where the same screen means different things. */
  labels?: Partial<Record<Role, string>>
  /** Roles for which this is one of the (max 4) always-visible phone tabs. */
  mobileBar?: readonly Role[]
  /** Prompt number that builds the real screen. */
  phase: number
  description: string
}

export const ROUTES: readonly RouteSpec[] = [
  {
    path: 'dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    section: 'Workspace',
    roles: ALL_ROLES,
    labels: { owner: 'Company overview', manager: 'Team overview', employee: 'My day' },
    mobileBar: ALL_ROLES,
    phase: 7,
    description: 'Your day at a glance.',
  },
  {
    path: 'tasks',
    title: 'Tasks',
    icon: CheckSquare,
    section: 'Workspace',
    roles: ALL_ROLES,
    labels: { owner: 'Company tasks', manager: 'Team tasks', employee: 'My tasks' },
    mobileBar: ALL_ROLES,
    phase: 7,
    description: 'Assigned work, status and history.',
  },
  {
    path: 'attendance',
    title: 'Attendance',
    icon: Clock,
    section: 'Workspace',
    roles: ALL_ROLES,
    labels: { owner: 'Attendance', manager: 'Team attendance', employee: 'Punch in / out' },
    mobileBar: ['employee'],
    phase: 7,
    description: 'Punch in and out, and attendance history.',
  },
  {
    path: 'leaves',
    title: 'Leave',
    icon: CalendarDays,
    section: 'Workspace',
    roles: ALL_ROLES,
    labels: { owner: 'Leave requests', manager: 'Leave approvals', employee: 'My leave' },
    mobileBar: ['manager'],
    phase: 7,
    description: 'Apply for leave and follow its status.',
  },
  {
    path: 'eod',
    title: 'End-of-day reports',
    icon: FileText,
    section: 'Workspace',
    roles: ALL_ROLES,
    labels: { owner: 'EOD reports', manager: 'EOD reports', employee: 'My EOD report' },
    phase: 7,
    description: 'Daily work reports.',
  },
  {
    path: 'projects',
    title: 'Projects',
    icon: Briefcase,
    section: 'Workspace',
    roles: ALL_ROLES,
    phase: 7,
    description: 'Projects you are part of.',
  },
  {
    path: 'service',
    title: 'Service calls',
    icon: Wrench,
    section: 'Service',
    roles: ALL_ROLES,
    labels: { employee: 'My service calls' },
    mobileBar: ALL_ROLES,
    phase: 10,
    description: 'Customer service calls, visits and reports.',
  },
  {
    path: 'customers',
    title: 'Customers',
    icon: Building2,
    section: 'Service',
    roles: ['owner', 'manager'],
    phase: 10,
    description: 'Customer directory.',
  },
  {
    path: 'machines',
    title: 'Machines',
    icon: Cpu,
    section: 'Service',
    roles: ['owner', 'manager'],
    phase: 10,
    description: 'Customer machines and their service history.',
  },
  {
    path: 'calendar',
    title: 'Team calendar',
    icon: CalendarDays,
    section: 'Service',
    roles: ['owner', 'manager'],
    mobileBar: ['owner'],
    phase: 11,
    description: 'Tasks and leave across the team.',
  },
  {
    path: 'reports',
    title: 'Reports',
    icon: BarChart3,
    section: 'Insights',
    roles: ['owner', 'manager'],
    phase: 11,
    description: 'Attendance, task, leave and service reports.',
  },
  {
    path: 'users',
    title: 'People',
    icon: Users,
    section: 'Administration',
    roles: ['owner', 'manager'],
    labels: { owner: 'Users & hierarchy', manager: 'My team' },
    phase: 9,
    description: 'Users, roles and the reporting hierarchy.',
  },
  {
    path: 'permissions',
    title: 'Permissions',
    icon: ShieldCheck,
    section: 'Administration',
    roles: ['owner'],
    phase: 9,
    description: 'What each manager can see and do.',
  },
  {
    path: 'audit-logs',
    title: 'Audit trail',
    icon: History,
    section: 'Administration',
    roles: ['owner'],
    phase: 9,
    description: 'Who changed what, and when.',
  },
]

export const NAV_SECTIONS: readonly NavSection[] = [
  'Workspace',
  'Service',
  'Insights',
  'Administration',
]

export function routeLabel(spec: RouteSpec, role: Role): string {
  return spec.labels?.[role] ?? spec.title
}

export function routesForRole(role: Role): RouteSpec[] {
  return ROUTES.filter((route) => route.roles.includes(role))
}

export function navGroupsForRole(role: Role): { section: NavSection; routes: RouteSpec[] }[] {
  const routes = routesForRole(role)
  return NAV_SECTIONS.map((section) => ({
    section,
    routes: routes.filter((route) => route.section === section),
  })).filter((group) => group.routes.length > 0)
}

export function mobileBarForRole(role: Role): RouteSpec[] {
  return routesForRole(role)
    .filter((route) => route.mobileBar?.includes(role))
    .slice(0, 4)
}

/** Handle attached to every route so layout pieces (header title) can read it. */
export interface RouteHandle {
  title: string
}
