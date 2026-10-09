import { Suspense, type ReactNode } from 'react'
import { PageSpinner } from '@/components/feedback/PageSpinner'
import { useAuth } from '@/features/auth/authContext'

/**
 * A screen that exists for some roles. Each phase adds the screens for one role; everyone else
 * keeps their placeholder until their own phase. A display hint only - the API decides access.
 */
export function ByRole({ employee, fallback }: { employee?: ReactNode; fallback: ReactNode }) {
  const { user } = useAuth()
  const content = user?.role === 'employee' && employee ? employee : fallback
  return <Suspense fallback={<PageSpinner label="Loading…" />}>{content}</Suspense>
}
