import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/Skeleton'

/** A dashboard figure that links to the list behind it. `value` undefined means "still loading". */
export function StatTile({ to, value, label }: { to: string; value: number | string | undefined; label: string }) {
  return (
    <Link to={to} className="stat glass-card" style={{ display: 'block', color: 'inherit' }}>
      <div className="stat-value">{value === undefined ? <Skeleton height={32} width={48} /> : value}</div>
      <div className="stat-label">{label}</div>
    </Link>
  )
}
