export function PageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="center-screen" role="status" aria-live="polite">
      <span className="spinner" style={{ width: 32, height: 32 }} aria-hidden="true" />
      <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{label}</span>
    </div>
  )
}
