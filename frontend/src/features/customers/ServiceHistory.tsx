import { Link } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Section } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth/authContext'
import { formatDateTime } from '@/lib/dates'
import { SERVICE_STATUS } from '@/lib/labels'
import { useServiceCalls } from '@/features/service/queries'

/** The employee's own calls for a customer or a machine (newest first, as the API returns them). */
export function ServiceHistory({ customerId, machineId }: { customerId?: string; machineId?: string }) {
  const isEmployee = useAuth().user?.role === 'employee'
  const query = useServiceCalls({
    ...(customerId ? { customer_id: customerId } : {}),
    ...(machineId ? { machine_id: machineId } : {}),
    page: 1,
    page_size: 20,
  })
  return (
    <Section
      title={isEmployee ? 'Service history (your calls)' : 'Service history'}
      action={<Link to={`/service?${customerId ? `customer=${customerId}` : `machine=${machineId}`}`}>All calls</Link>}
    >
      <QueryBoundary
        query={query}
        skeleton={<Skeleton height={44} />}
        isEmpty={(data) => data.items.length === 0}
        empty={<p>{isEmployee ? 'No service calls of yours for this record.' : 'No service calls you can see for this record.'}</p>}
      >
        {(data) => (
          <ul style={{ listStyle: 'none' }} className="stack">
            {data.items.map((call) => (
              <li key={call.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                <span>
                  <Link className="inline-link" to={`/service/${call.id}`}>{call.service_call_code}</Link> · {formatDateTime(call.contacted_at)}
                  <span className="clamp-2">{call.issue_reported}</span>
                </span>
                <StatusBadge table={SERVICE_STATUS} value={call.status} />
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
    </Section>
  )
}
