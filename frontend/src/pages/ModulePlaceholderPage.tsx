import { Construction } from 'lucide-react'
import { useMatches } from 'react-router-dom'
import { ROUTES } from '@/app/route-config'

/** Stands in for a screen that a later phase builds. Shows no data and no mock content. */
export function ModulePlaceholderPage() {
  const matches = useMatches()
  const last = matches[matches.length - 1]
  const spec = ROUTES.find((route) => last?.pathname.endsWith(`/${route.path}`))
  return (
    <section>
      <header className="page-header">
        <h1>{spec?.title ?? 'Coming soon'}</h1>
        <p>{spec?.description}</p>
      </header>
      <div className="glass-card" style={{ padding: 32, textAlign: 'center' }}>
        <Construction size={32} aria-hidden="true" color="var(--text-muted)" />
        <h2 style={{ marginTop: 12 }}>Not built yet</h2>
        <p>
          This screen is part of a later phase (Prompt {spec?.phase ?? '?'}). The sign-in, session
          handling and navigation you are using are the real thing.
        </p>
      </div>
    </section>
  )
}
