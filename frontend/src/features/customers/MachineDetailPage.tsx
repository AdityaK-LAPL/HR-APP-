import { Link, useParams } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { BackLink } from '@/components/ui/BackLink'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AttachmentsPanel } from '@/features/attachments/AttachmentsPanel'
import { formatDate } from '@/lib/dates'
import { MACHINE_STATUS } from '@/lib/labels'
import { useCustomer, useMachine } from '@/features/service/queries'
import { ServiceHistory } from './ServiceHistory'

export function MachineDetailPage() {
  const { id = '' } = useParams()
  const machine = useMachine(id)
  const customer = useCustomer(machine.data?.customer_id)

  return (
    <QueryBoundary query={machine}>
      {(data) => (
        <section>
          <PageHeader
            back={<BackLink to="/machines">All machines</BackLink>}
            title={data.model_name ? `${data.machine_code} · ${data.model_name}` : data.machine_code}
          />
          <Section title="Details">
            <dl className="facts">
              <dt>Customer</dt>
              <dd>{customer.data ? <Link className="inline-link" to={`/customers/${customer.data.id}`}>{customer.data.name}</Link> : customer.isPending ? '…' : 'Not available to you'}</dd>
              <dt>Serial number</dt>
              <dd>{data.serial_number ?? '—'}</dd>
              <dt>Status</dt>
              <dd>
                <StatusBadge table={MACHINE_STATUS} value={data.status} />
              </dd>
              <dt>Location</dt>
              <dd>{data.location ?? '—'}</dd>
              <dt>Installed</dt>
              <dd>{formatDate(data.installation_date) || '—'}</dd>
              <dt>Warranty</dt>
              <dd className="prose">{data.warranty_info ?? '—'}</dd>
              {data.purchase_info && (
                <>
                  <dt>Purchase</dt>
                  <dd className="prose">{data.purchase_info}</dd>
                </>
              )}
            </dl>
          </Section>
          <ServiceHistory machineId={data.id} />
          <AttachmentsPanel entityType="machine" entityId={data.id} title="Machine files" />
        </section>
      )}
    </QueryBoundary>
  )
}
