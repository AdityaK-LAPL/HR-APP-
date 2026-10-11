import { Download, Share, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { isIosSafari } from '@/lib/platform'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'opsflow.install-dismissed'

const readDismissed = (): boolean => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false // storage can be blocked (private mode); the banner then simply returns next visit
  }
}

const isStandalone = (): boolean =>
  (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Offers "install as an app" when the browser says it can (or explains how on iOS). Never shown once installed. */
export function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setPromptEvent(null)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // not persisted; fine
    }
  }

  const ios = isIosSafari()
  if (dismissed || isStandalone() || (!promptEvent && !ios)) return null

  const install = async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    if (outcome === 'accepted') setPromptEvent(null)
  }

  return (
    <aside className="install-banner glass-card" aria-label="Install the app">
      {promptEvent ? <Download size={20} aria-hidden="true" color="var(--primary)" /> : <Share size={20} aria-hidden="true" color="var(--primary)" />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: 13 }}>Install OpsFlow</strong>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {promptEvent
            ? 'Open it like an app from your home screen or desktop.'
            : 'Tap the Share button in Safari, then “Add to Home Screen”, to open it like an app.'}
        </p>
      </div>
      {promptEvent && (
        <Button size="sm" needsConnection={false} onClick={() => void install()}>
          Install
        </Button>
      )}
      <button type="button" className="icon-btn" aria-label="Dismiss install suggestion" onClick={dismiss}>
        <X size={16} />
      </button>
    </aside>
  )
}
