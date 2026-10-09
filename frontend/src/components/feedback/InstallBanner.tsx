import { Download, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Offers "install as an app" when the browser says it can. Never shown once installed. */
export function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const installed =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  if (!promptEvent || dismissed || installed) return null

  const install = async () => {
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    if (outcome === 'accepted') setPromptEvent(null)
  }

  return (
    <aside className="install-banner glass-card" aria-label="Install the app">
      <Download size={20} aria-hidden="true" color="var(--primary)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: 13 }}>Install OpsFlow</strong>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Open it like an app from your home screen or desktop.
        </p>
      </div>
      <Button size="sm" onClick={() => void install()}>
        Install
      </Button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Dismiss install suggestion"
        onClick={() => setDismissed(true)}
      >
        <X size={16} />
      </button>
    </aside>
  )
}
