import { Navigate, type RouteObject } from 'react-router-dom'
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

/** Screens by path for the employee role (Prompt 7). Other roles get the placeholder until their phase. */
const EMPLOYEE_SCREENS: Record<string, React.ReactNode> = {
  dashboard: <Screen.EmployeeDashboard />,
  tasks: <Screen.TasksPage />,
  attendance: <Screen.AttendancePage />,
  leaves: <Screen.LeavePage />,
  eod: <Screen.EodListPage />,
  projects: <Screen.ProjectsPage />,
  service: <Screen.ServiceListPage />,
  customers: <Screen.CustomersPage />,
  machines: <Screen.MachinesPage />,
}

const moduleRoutes: RouteObject[] = ROUTES.map((spec) => ({
  path: spec.path,
  handle: handle(spec.title),
  element: (
    <RoleGate roles={spec.roles}>
      <ByRole
        employee={EMPLOYEE_SCREENS[spec.path]}
        fallback={spec.path === 'dashboard' ? <Screen.FoundationDashboard /> : <Screen.ModulePlaceholderPage />}
      />
    </RoleGate>
  ),
}))

/** Detail and form screens (employee only for now; everyone else sees "Not available"). */
const employeeOnly = (path: string, title: string, screen: React.ReactNode): RouteObject => ({
  path,
  handle: handle(title),
  element: <ByRole employee={screen} fallback={<NotAvailablePage />} />,
})

const detailRoutes: RouteObject[] = [
  employeeOnly('tasks/:id', 'Task', <Screen.TaskDetailPage />),
  employeeOnly('projects/:id', 'Project', <Screen.ProjectDetailPage />),
  employeeOnly('eod/new', 'New EOD report', <Screen.EodFormPage />),
  employeeOnly('eod/:id', 'EOD report', <Screen.EodDetailPage />),
  employeeOnly('service/:id', 'Service call', <Screen.ServiceDetailPage />),
  employeeOnly('customers/:id', 'Customer', <Screen.CustomerDetailPage />),
  employeeOnly('machines/:id', 'Machine', <Screen.MachineDetailPage />),
  {
    path: 'profile',
    handle: handle('My profile'),
    element: <ByRole employee={<Screen.ProfilePage />} fallback={<Screen.ProfilePage />} />,
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
