import type { ReactNode } from 'react'

/** The single <h1> of a screen, with an optional description and action buttons. */
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string
  description?: string
  actions?: ReactNode
  back?: ReactNode
}) {
  return (
    <header className="page-header">
      {back}
      <div className="page-header-row">
        <div style={{ minWidth: 0 }}>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  )
}

export function Section({
  title,
  action,
  children,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="section glass-card">
      {(title || action) && (
        <div className="section-head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
