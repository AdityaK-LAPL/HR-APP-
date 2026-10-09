import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import { PageSpinner } from '@/components/feedback/PageSpinner'
import { NotAvailablePage } from '@/pages/NotAvailablePage'
import type { Role } from '@/api/types'

/**
 * Everything inside needs a session. A user who must still change a temporary password can
 * reach nothing else: the server enforces this too (403 password_change_required).
 */
export function RequireAuth() {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <PageSpinner label="Restoring your session…" />
  if (status === 'anonymous' || !user) {
    // Remember where they were going - except the password screen: after changing a password you
    // sign in again and should land in the app, not back on the form you just completed.
    const from = location.pathname === '/change-password' ? undefined : location.pathname + location.search
    return <Navigate to="/login" replace state={from ? { from } : null} />
  }
  if (user.must_reset && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  return <Outlet />
}

/** The login page is pointless for someone already signed in. */
export function PublicOnly() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageSpinner label="Loading…" />
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/'} replace />
  }
  return <Outlet />
}

/**
 * Friendly screen when the wrong role opens a URL. A display hint only - the API is the
 * authority and the data endpoints would answer 403/404 anyway.
 */
export function RoleGate({ roles, children }: { roles: readonly Role[]; children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) return <NotAvailablePage />
  return <>{children}</>
}
