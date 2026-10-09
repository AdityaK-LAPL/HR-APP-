import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ListSkeleton } from '@/components/ui/Skeleton'

/**
 * One place that turns a query into loading / error / empty / content, so no screen forgets a
 * state. 403/404 render the neutral "not available" message; network/5xx offer a retry.
 */
export function QueryBoundary<T>({
  query,
  isEmpty,
  empty,
  skeleton,
  children,
}: {
  query: UseQueryResult<T>
  isEmpty?: (data: T) => boolean
  empty?: ReactNode
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <>{skeleton ?? <ListSkeleton />}</>
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (isEmpty?.(query.data) && empty) return <>{empty}</>
  return <>{children(query.data)}</>
}
