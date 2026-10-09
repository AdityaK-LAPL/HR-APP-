import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'

const ICONS = { error: ShieldAlert, info: Info, warning: AlertTriangle, success: CheckCircle2 }

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: keyof typeof ICONS
  children: ReactNode
}) {
  const Icon = ICONS[tone]
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}
