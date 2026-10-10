import { Suspense, type ReactNode } from 'react'
import { PageSpinner } from '@/components/feedback/PageSpinner'
import { useAuth } from '@/features/auth/authContext'
import type { Role } from '@/api/types'

/**
 * The screen a role gets for a route. Each delivery phase adds the screens for one role; a role
 * without one falls back (placeholder or "not available"). A display hint only - the API decides
 * access and answers 403/404 for anything the caller may not do.
 */
export function ByRole({
  screens,
  fallback,
}: {
  screens: Partial<Record<Role, ReactNode>>
  fallback: ReactNode
}) {
  const { user } = useAuth()
  const content = (user && screens[user.role]) || fallback
  return <Suspense fallback={<PageSpinner label="Loading…" />}>{content}</Suspense>
}
