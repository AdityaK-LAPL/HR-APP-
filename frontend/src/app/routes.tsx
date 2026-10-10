import { Navigate, type RouteObject } from 'react-router-dom'
import type { Role } from '@/api/types'
import { PageSpinner } from '@/components/feedback/PageSpinner'
import { AppShell } from '@/components/layout/AppShell'
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { NotAvailablePage } from '@/pages/NotAvailablePage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'
import { ByRole } from './ByRole'
import { PublicOnly, RequireAuth, RoleGate } from './guards'
import { ROUTES, type RouteHandle } from './route-config'
import * as Screen from './screens'

const handle = (title: string): RouteHandle => ({ title })

type RoleScreens = Partial<Record<Role, React.ReactNode>>

/** The same screen for employees and managers (the screen itself adapts to the role). */
const staff = (screen: React.ReactNode): RoleScreens => ({ employee: screen, manager: screen })

/**
 * Screens by path and role. Employee screens shipped in Prompt 7, manager screens in Prompt 8;
 * the Owner keeps the placeholders until Prompt 9. Which role sees a route is a display hint -
 * the API answers 403/404 for anything the caller may not do.
 */
const SCREENS: Record<string, RoleScreens> = {
  dashboard: { employee: <Screen.EmployeeDashboard />, manager: <Screen.ManagerDashboard /> },
  tasks: { employee: <Screen.TasksPage />, manager: <Screen.TeamTasksPage /> },
  attendance: { employee: <Screen.AttendancePage />, manager: <Screen.TeamAttendancePage /> },
  leaves: { employee: <Screen.LeavePage />, manager: <Screen.ManagerLeavePage /> },
  eod: { employee: <Screen.EodListPage />, manager: <Screen.ManagerEodPage /> },
  projects: staff(<Screen.ProjectsPage />),
  service: staff(<Screen.ServiceListPage />),
  customers: staff(<Screen.CustomersPage />),
  machines: staff(<Screen.MachinesPage />),
  calendar: { manager: <Screen.CalendarPage /> },
  users: { manager: <Screen.TeamPage /> },
}

const moduleRoutes: RouteObject[] = ROUTES.map((spec) => ({
  path: spec.path,
  handle: handle(spec.title),
  element: (
    <RoleGate roles={spec.roles}>
      <ByRole
        screens={SCREENS[spec.path] ?? {}}
        fallback={spec.path === 'dashboard' ? <Screen.FoundationDashboard /> : <Screen.ModulePlaceholderPage />}
      />
    </RoleGate>
  ),
}))

/** Detail and form screens; roles without one see "Not available". */
const roleRoute = (path: string, title: string, screens: RoleScreens): RouteObject => ({
  path,
  handle: handle(title),
  element: <ByRole screens={screens} fallback={<NotAvailablePage />} />,
})

const detailRoutes: RouteObject[] = [
  roleRoute('tasks/:id', 'Task', staff(<Screen.TaskDetailPage />)),
  roleRoute('projects/:id', 'Project', staff(<Screen.ProjectDetailPage />)),
  roleRoute('eod/new', 'New EOD report', staff(<Screen.EodFormPage />)),
  roleRoute('eod/:id', 'EOD report', staff(<Screen.EodDetailPage />)),
  roleRoute('service/:id', 'Service call', staff(<Screen.ServiceDetailPage />)),
  roleRoute('customers/:id', 'Customer', staff(<Screen.CustomerDetailPage />)),
  roleRoute('machines/:id', 'Machine', staff(<Screen.MachineDetailPage />)),
  roleRoute('users/:id', 'Person', { manager: <Screen.PersonPage /> }),
  {
    path: 'notifications',
    handle: handle('Notifications'),
    element: <ByRole screens={{ employee: <Screen.NotificationsPage />, manager: <Screen.NotificationsPage /> }} fallback={<NotAvailablePage />} />,
  },
  {
    path: 'profile',
    handle: handle('My profile'),
    element: <ByRole screens={{}} fallback={<Screen.ProfilePage />} />,
  },
]

export const appRoutes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    HydrateFallback: () => <PageSpinner />,
    children: [
      {
        element: <PublicOnly />,
        children: [{ path: '/login', element: <LoginPage />, handle: handle('Sign in') }],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/change-password',
            element: <ChangePasswordPage />,
            handle: handle('Change password'),
          },
          {
            path: '/',
            element: <AppShell />,
            children: [
              { index: true, element: <Navigate to="/dashboard" replace /> },
              ...moduleRoutes,
              ...detailRoutes,
              { path: '*', element: <NotAvailablePage />, handle: handle('Not available') },
            ],
          },
        ],
      },
    ],
  },
]
