import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
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
  // A refresh that failed after data had loaded keeps showing that data, with a plain note - better
  // than replacing a working screen with an error because the connection blinked.
  if (query.isError && query.data !== undefined && !(isEmpty?.(query.data) && empty)) {
    return (
      <>
        <div className="banner banner-offline" role="status" style={{ marginBottom: 12 }}>
          <span>Couldn&apos;t refresh just now - this is what was loaded earlier.</span>
          <Button size="sm" variant="outline" needsConnection={false} icon={<RefreshCw size={14} />} onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
        {children(query.data)}
      </>
    )
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (isEmpty?.(query.data) && empty) return <>{empty}</>
  return <>{children(query.data)}</>
}
