import { Link, useParams } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { BackLink } from '@/components/ui/BackLink'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AttachmentsPanel } from '@/features/attachments/AttachmentsPanel'
import { MACHINE_STATUS } from '@/lib/labels'
import { useCustomer, useCustomerContacts, useMachines } from '@/features/service/queries'
import { ServiceHistory } from './ServiceHistory'

export function CustomerDetailPage() {
  const { id = '' } = useParams()
  const customer = useCustomer(id)
  const contacts = useCustomerContacts(id)
  const machines = useMachines({ customer_id: id, page: 1, page_size: 50 })

  return (
    <QueryBoundary query={customer}>
      {(data) => (
        <section>
          <PageHeader back={<BackLink to="/customers">All customers</BackLink>} title={data.name} description={data.customer_code} />
          <Section title="Details">
            <dl className="facts">
              <dt>Address</dt>
              <dd className="prose">{data.address ?? '—'}</dd>
              <dt>Account</dt>
              <dd>{data.is_active ? 'Active' : 'Inactive'}</dd>
              {data.notes && (
                <>
                  <dt>Notes</dt>
                  <dd className="prose">{data.notes}</dd>
                </>
              )}
            </dl>
          </Section>
          <Section title="Contacts">
            <QueryBoundary query={contacts} isEmpty={(rows) => rows.length === 0} empty={<p>No contacts on file.</p>}>
              {(rows) => (
                <ul style={{ listStyle: 'none' }} className="stack">
                  {rows.map((contact) => (
                    <li key={contact.id}>
                      <strong>{contact.name}</strong>
                      {contact.is_primary ? ' (primary)' : ''}
                      {contact.designation ? ` · ${contact.designation}` : ''}
                      <div className="meta-line">
                        {contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}
                        {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </QueryBoundary>
          </Section>
          <Section title="Machines">
            <QueryBoundary query={machines} isEmpty={(m) => m.items.length === 0} empty={<p>No machines visible to you.</p>}>
              {(m) => (
                <ul style={{ listStyle: 'none' }} className="stack">
                  {m.items.map((machine) => (
                    <li key={machine.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                      <span>
                        <Link className="inline-link" to={`/machines/${machine.id}`}>{machine.machine_code}</Link>
                        {machine.model_name ? ` · ${machine.model_name}` : ''}
                        {machine.serial_number ? ` · ${machine.serial_number}` : ''}
                      </span>
                      <StatusBadge table={MACHINE_STATUS} value={machine.status} />
                    </li>
                  ))}
                </ul>
              )}
            </QueryBoundary>
          </Section>
          <ServiceHistory customerId={data.id} />
          <AttachmentsPanel entityType="customer" entityId={data.id} title="Customer files" />
        </section>
      )}
    </QueryBoundary>
  )
}
