import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from './useOnlineStatus'

/** Shown while offline. The app shell is cached, but data and changes need a connection. */
export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div className="banner banner-offline" role="status">
      <WifiOff size={16} aria-hidden="true" />
      <span>You&apos;re offline. You can look around, but saving and loading data need a connection.</span>
    </div>
  )
}
