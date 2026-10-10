import { MapPin, Pencil, Plus, Power, PowerOff, UserPlus, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { useToast } from '@/components/feedback/toastContext'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AttachmentsPanel } from '@/features/attachments/AttachmentsPanel'
import { useAuth } from '@/features/auth/authContext'
import { ServiceCallFormDialog } from '@/features/service/ServiceCallFormDialog'
import { useCustomer, useCustomerContacts, useMachines, type CustomerContact } from '@/features/service/queries'
import { mapsUrl } from '@/lib/maps'
import { MACHINE_STATUS } from '@/lib/labels'
import { ContactDialog } from './ContactDialog'
import { CustomerFormDialog } from './CustomerFormDialog'
import { MachineFormDialog } from './MachineFormDialog'
import { useUpdateCustomer } from './queries'
import { ServiceHistory } from './ServiceHistory'

export function CustomerDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const customer = useCustomer(id)
  const contacts = useCustomerContacts(id)
  const machines = useMachines({ customer_id: id, page: 1, page_size: 50 })
  const update = useUpdateCustomer()
  const isStaff = user?.role === 'manager' || user?.role === 'owner'
  const isOwner = user?.role === 'owner'
  const [dialog, setDialog] = useState<'edit' | 'call' | 'machine' | 'status' | null>(null)
  const [contactDialog, setContactDialog] = useState<{ open: boolean; contact: CustomerContact | undefined }>({ open: false, contact: undefined })

  return (
    <QueryBoundary query={customer}>
      {(data) => (
        <section>
          <PageHeader
            back={<BackLink to="/customers">All customers</BackLink>}
            title={data.name}
            description={data.customer_code}
            actions={
              isStaff ? (
                <>
                  <Button icon={<Wrench size={16} />} onClick={() => setDialog('call')}>
                    Log a service call
                  </Button>
                  <Button variant="outline" icon={<Pencil size={16} />} onClick={() => setDialog('edit')}>
                    Edit customer
                  </Button>
                  {isOwner && (
                    <Button variant="outline" icon={data.is_active ? <PowerOff size={16} /> : <Power size={16} />} onClick={() => setDialog('status')}>
                      {data.is_active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  )}
                </>
              ) : undefined
            }
          />
          <Section title="Details">
            <dl className="facts">
              <dt>Address</dt>
              <dd className="prose">
                {data.address ?? '—'}
                {data.address && (
                  <>
                    {' '}
                    <a className="inline-link" href={mapsUrl(data.address)} target="_blank" rel="noopener noreferrer">
                      <MapPin size={14} aria-hidden="true" /> Open in Maps
                    </a>
                  </>
                )}
              </dd>
              <dt>Account</dt>
              <dd>
                <span className={`badge ${data.is_active ? 'badge-success' : 'badge-neutral'}`}>{data.is_active ? 'Active' : 'Inactive'}</span>
              </dd>
              {data.notes && (
                <>
                  <dt>Notes</dt>
                  <dd className="prose">{data.notes}</dd>
                </>
              )}
            </dl>
          </Section>
          <Section
            title="Contacts"
            action={
              isStaff ? (
                <Button size="sm" icon={<UserPlus size={16} />} onClick={() => setContactDialog({ open: true, contact: undefined })}>
                  Add contact
                </Button>
              ) : undefined
            }
          >
            <QueryBoundary query={contacts} isEmpty={(rows) => rows.length === 0} empty={<p>No contacts on file.</p>}>
              {(rows) => (
                <ul style={{ listStyle: 'none' }} className="stack">
                  {rows.map((contact) => (
                    <li key={contact.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                      <span>
                        <strong>{contact.name}</strong>
                        {contact.is_primary ? ' (primary)' : ''}
                        {contact.designation ? ` · ${contact.designation}` : ''}
                        <span className="meta-line">
                          {contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}
                          {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
                        </span>
                      </span>
                      {isStaff && (
                        <Button size="sm" variant="outline" icon={<Pencil size={14} />} onClick={() => setContactDialog({ open: true, contact })} aria-label={`Edit contact ${contact.name}`}>
                          Edit
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </QueryBoundary>
          </Section>
          <Section
            title="Machines"
            action={
              isStaff ? (
                <Button size="sm" icon={<Plus size={16} />} onClick={() => setDialog('machine')}>
                  Add machine
                </Button>
              ) : undefined
            }
          >
            <QueryBoundary query={machines} isEmpty={(m) => m.items.length === 0} empty={<p>{isStaff ? 'No machines yet. Add the first one.' : 'No machines visible to you.'}</p>}>
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
          <AttachmentsPanel entityType="customer" entityId={data.id} canUpload={isStaff} title="Customer files" />

          {isStaff && (
            <>
              <CustomerFormDialog open={dialog === 'edit'} onClose={() => setDialog(null)} customer={data} />
              <ContactDialog customerId={data.id} contact={contactDialog.contact} open={contactDialog.open} onClose={() => setContactDialog((c) => ({ ...c, open: false }))} />
              {dialog === 'machine' && <MachineFormDialog open onClose={() => setDialog(null)} customer={{ id: data.id, name: data.name }} />}
              {dialog === 'call' && <ServiceCallFormDialog open onClose={() => setDialog(null)} customer={{ id: data.id, name: data.name }} />}
            </>
          )}
          {isOwner && (
            <ConfirmDialog
              open={dialog === 'status'}
              tone={data.is_active ? 'danger' : 'default'}
              title={data.is_active ? `Deactivate ${data.name}?` : `Reactivate ${data.name}?`}
              message={
                data.is_active
                  ? 'The customer is marked inactive. Their machines, service history and files are kept, and you can reactivate them at any time.'
                  : 'The customer becomes active again.'
              }
              confirmLabel={data.is_active ? 'Deactivate' : 'Reactivate'}
              busy={update.isPending}
              onCancel={() => setDialog(null)}
              onConfirm={() =>
                update.mutate(
                  { id: data.id, patch: { is_active: !data.is_active } },
                  {
                    onSuccess: () => toast.success(data.is_active ? 'Customer deactivated.' : 'Customer reactivated.'),
                    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not change the customer.'),
                    onSettled: () => setDialog(null),
                  },
                )
              }
            />
          )}
        </section>
      )}
    </QueryBoundary>
  )
}
