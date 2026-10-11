import { RefreshCw } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/Button'

const UPDATE_CHECK_MS = 60 * 60 * 1000

/**
 * "A new version is ready". Updates wait for the user (registerType: 'prompt') so a deploy never
 * reloads the page under someone who is half-way through filling in a form.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // An app left open (or installed on a phone) would otherwise only notice a new version when it
    // is next opened from scratch: look for one hourly, and when the app comes back to the front.
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => undefined)
      }
      setInterval(check, UPDATE_CHECK_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
  if (!needRefresh) return null
  return (
    <div className="banner banner-update" role="status">
      <RefreshCw size={16} aria-hidden="true" />
      <span>A new version of the app is available.</span>
      <Button size="sm" needsConnection={false} onClick={() => void updateServiceWorker(true)}>
        Reload to update
      </Button>
    </div>
  )
}
