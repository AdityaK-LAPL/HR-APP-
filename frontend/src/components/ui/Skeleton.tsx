/** Placeholder shapes while data loads; announced once as a busy region by the parent. */
export function Skeleton({ height = 20, width = '100%' }: { height?: number | string; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="glass-card" style={{ padding: 16 }}>
          <Skeleton height={16} width="45%" />
          <div style={{ height: 10 }} />
          <Skeleton height={12} width="80%" />
        </div>
      ))}
    </div>
  )
}
