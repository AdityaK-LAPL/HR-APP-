import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useOnlineStatus } from '@/components/feedback/useOnlineStatus'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  /** Shows a spinner and disables the button (also the double-submit guard for forms). */
  loading?: boolean
  block?: boolean
  icon?: ReactNode
  /**
   * The action saves something, so it cannot work offline and is disabled until the connection
   * returns. By default that is every submit button and every primary / danger / success action
   * (not filter toggles); pass `false` for one that only changes what is shown.
   */
  needsConnection?: boolean
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  icon,
  className = '',
  disabled,
  type = 'button',
  needsConnection,
  ...props
}: ButtonProps) {
  const online = useOnlineStatus()
  const saves = needsConnection ?? (type === 'submit' || variant === 'danger' || variant === 'success' || (variant === 'primary' && props['aria-pressed'] === undefined))
  const blocked = saves && !online
  const classes = ['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading || blocked}
      title={blocked ? 'Needs a connection' : props.title}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
}
