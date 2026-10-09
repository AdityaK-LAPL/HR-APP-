import { RefreshCw, ShieldOff } from 'lucide-react'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/Button'

/** What a failed page/section load shows. 403 and 404 look the same on purpose. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = error instanceof ApiError ? error : null

  if (apiError?.isNotAvailable) {
    return (
      <div className="center-screen" role="alert" style={{ minHeight: '40vh' }}>
        <ShieldOff size={36} aria-hidden="true" color="var(--text-muted)" />
        <h2>Not available</h2>
        <p>This page or record doesn&apos;t exist, or you don&apos;t have access to it.</p>
      </div>
    )
  }

  const message = apiError?.isNetworkError
    ? 'Cannot reach the server. Check your connection and try again.'
    : (apiError?.message ?? 'Something went wrong.')
  return (
    <div className="center-screen" role="alert" style={{ minHeight: '40vh' }}>
      <h2>Couldn&apos;t load this</h2>
      <p>{message}</p>
      {apiError?.requestId && apiError.status >= 500 && (
        <p style={{ fontSize: 12 }}>Reference: {apiError.requestId}</p>
      )}
      {onRetry && (
        <Button variant="outline" icon={<RefreshCw size={16} />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
