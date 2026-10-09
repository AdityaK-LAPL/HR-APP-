import { RefreshCw } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/Button'

/**
 * "A new version is ready". Updates wait for the user (registerType: 'prompt') so a deploy never
 * reloads the page under someone who is half-way through filling in a form.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  if (!needRefresh) return null
  return (
    <div className="banner banner-update" role="status">
      <RefreshCw size={16} aria-hidden="true" />
      <span>A new version of the app is available.</span>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        Reload to update
      </Button>
    </div>
  )
}
