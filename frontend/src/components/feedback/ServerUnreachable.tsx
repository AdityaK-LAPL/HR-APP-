import { RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useOnlineStatus } from './useOnlineStatus'

/**
 * The app opened (from the home screen or the cache) but the server cannot be reached, so we do not
 * yet know who is signed in. This is NOT a sign-out: the session cookie is untouched, and the page
 * retries on its own the moment the connection returns.
 */
export function ServerUnreachable({ onRetry }: { onRetry: () => void }) {
  const online = useOnlineStatus()
  return (
    <main className="center-screen" role="alert" style={{ minHeight: '100vh' }}>
      <WifiOff size={40} aria-hidden="true" color="var(--text-muted)" />
      <h1 style={{ fontSize: '1.35rem' }}>{online ? "Can't reach the server" : "You're offline"}</h1>
      <p style={{ maxWidth: 420, textAlign: 'center' }}>
        {online
          ? 'The app is installed and ready, but the server is not answering. You are still signed in; try again in a moment.'
          : 'The app is installed and ready, but data and changes need a connection. You are still signed in - this page will continue by itself when you are back online.'}
      </p>
      <Button variant="outline" icon={<RefreshCw size={16} />} onClick={onRetry}>
        Try again
      </Button>
    </main>
  )
}
