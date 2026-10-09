import { Navigate, type RouteObject } from 'react-router-dom'
import { PageSpinner } from '@/components/feedback/PageSpinner'
import { AppShell } from '@/components/layout/AppShell'
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { NotAvailablePage } from '@/pages/NotAvailablePage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'
import { PublicOnly, RequireAuth, RoleGate } from './guards'
import { ROUTES, type RouteHandle } from './route-config'

const handle = (title: string): RouteHandle => ({ title })

const moduleRoutes: RouteObject[] = ROUTES.map((spec) => ({
  path: spec.path,
  handle: handle(spec.title),
  // Lazy: each screen is its own chunk. Until its phase lands, every module is the placeholder.
  lazy: async () => {
    if (spec.path === 'dashboard') {
      const { DashboardPage } = await import('@/pages/DashboardPage')
      return { element: <DashboardPage /> }
    }
    const { ModulePlaceholderPage } = await import('@/pages/ModulePlaceholderPage')
    return {
      element: (
        <RoleGate roles={spec.roles}>
          <ModulePlaceholderPage />
        </RoleGate>
      ),
    }
  },
}))

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
              { path: '*', element: <NotAvailablePage />, handle: handle('Not available') },
            ],
          },
        ],
      },
    ],
  },
]
