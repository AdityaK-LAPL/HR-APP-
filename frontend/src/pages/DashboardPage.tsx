import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { AppConfig } from '@/api/types'
import { useAuth } from '@/features/auth/authContext'
import { usePeople } from '@/features/people/usePeople'
import { formatDate } from '@/lib/dates'

/**
 * Foundation dashboard: real data only (who you are, who you report to, the company day).
 * The per-role dashboards arrive with their phases (7, 8, 9, 11).
 */
export function DashboardPage() {
  const { user } = useAuth()
  const { nameOf, isLoading: loadingPeople } = usePeople([user?.manager_id])
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: ({ signal }) => api.get<AppConfig>('/config', { signal }),
    staleTime: Infinity,
  })
  if (!user) return null

  return (
    <section>
      <header className="page-header">
        <h1>Hello, {user.name.split(' ')[0]}</h1>
        <p>You are signed in as {user.role}.</p>
      </header>
      <div className="glass-card" style={{ padding: 24, maxWidth: 560 }}>
        <dl className="facts">
          <dt>Employee ID</dt>
          <dd>{user.employee_code}</dd>
          <dt>Name</dt>
          <dd>{user.name}</dd>
          <dt>Designation</dt>
          <dd>{user.designation ?? '—'}</dd>
          <dt>Reports to</dt>
          <dd>
            {user.manager_id ? (loadingPeople ? 'Loading…' : nameOf(user.manager_id)) : '—'}
          </dd>
          <dt>Company day</dt>
          <dd>
            {config ? `${formatDate(config.today)} (${config.company_timezone})` : 'Loading…'}
          </dd>
        </dl>
      </div>
    </section>
  )
}
