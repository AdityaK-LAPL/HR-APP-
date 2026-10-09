/** Lazily loaded screens. Each is its own chunk; the employee screens ship with Prompt 7. */
import { lazy } from 'react'

const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, key: K) =>
  lazy(() => load().then((module) => ({ default: module[key] })))

export const EmployeeDashboard = named(() => import('@/features/dashboard/EmployeeDashboard'), 'EmployeeDashboard')
export const TasksPage = named(() => import('@/features/tasks/TasksPage'), 'TasksPage')
export const TaskDetailPage = named(() => import('@/features/tasks/TaskDetailPage'), 'TaskDetailPage')
export const ProjectsPage = named(() => import('@/features/projects/ProjectsPage'), 'ProjectsPage')
export const ProjectDetailPage = named(() => import('@/features/projects/ProjectDetailPage'), 'ProjectDetailPage')
export const LeavePage = named(() => import('@/features/leave/LeavePage'), 'LeavePage')
export const EodListPage = named(() => import('@/features/eod/EodListPage'), 'EodListPage')
export const EodFormPage = named(() => import('@/features/eod/EodFormPage'), 'EodFormPage')
export const EodDetailPage = named(() => import('@/features/eod/EodDetailPage'), 'EodDetailPage')
export const AttendancePage = named(() => import('@/features/attendance/AttendancePage'), 'AttendancePage')
export const ServiceListPage = named(() => import('@/features/service/ServiceListPage'), 'ServiceListPage')
export const ServiceDetailPage = named(() => import('@/features/service/ServiceDetailPage'), 'ServiceDetailPage')
export const CustomersPage = named(() => import('@/features/customers/CustomersPage'), 'CustomersPage')
export const CustomerDetailPage = named(() => import('@/features/customers/CustomerDetailPage'), 'CustomerDetailPage')
export const MachinesPage = named(() => import('@/features/customers/MachinesPage'), 'MachinesPage')
export const MachineDetailPage = named(() => import('@/features/customers/MachineDetailPage'), 'MachineDetailPage')
export const ProfilePage = named(() => import('@/features/profile/ProfilePage'), 'ProfilePage')
export const FoundationDashboard = named(() => import('@/pages/DashboardPage'), 'DashboardPage')
export const ModulePlaceholderPage = named(() => import('@/pages/ModulePlaceholderPage'), 'ModulePlaceholderPage')
