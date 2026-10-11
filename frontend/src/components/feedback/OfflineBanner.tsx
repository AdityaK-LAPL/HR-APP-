import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from './useOnlineStatus'

/** Shown while offline. The app shell is cached, but data and changes need a connection. */
export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div className="banner banner-offline" role="status">
      <WifiOff size={16} aria-hidden="true" />
      <span>
        You&apos;re offline. The app is here, but loading data and saving changes need a connection - buttons that save are switched off until you are back online.
      </span>
    </div>
  )
}
