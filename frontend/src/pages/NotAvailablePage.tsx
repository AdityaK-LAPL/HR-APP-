import { ShieldOff } from 'lucide-react'
import { Link } from 'react-router-dom'

/** One screen for "no such page", "no such record" and "not yours": the API never says which. */
export function NotAvailablePage() {
  return (
    <div className="center-screen" style={{ minHeight: '50vh' }}>
      <ShieldOff size={40} aria-hidden="true" color="var(--text-muted)" />
      <h1>Not available</h1>
      <p>This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link to="/">Go to your dashboard</Link>
    </div>
  )
}
