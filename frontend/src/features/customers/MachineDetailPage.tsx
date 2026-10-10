import { Pencil, Power, PowerOff, Wrench } from 'lucide-react'
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
import { useCustomer, useMachine } from '@/features/service/queries'
import { formatDate } from '@/lib/dates'
import { MACHINE_STATUS } from '@/lib/labels'
import { MachineFormDialog } from './MachineFormDialog'
import { useUpdateMachine } from './queries'
import { ServiceHistory } from './ServiceHistory'

export function MachineDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const machine = useMachine(id)
  const customer = useCustomer(machine.data?.customer_id)
  const update = useUpdateMachine()
  const isStaff = user?.role === 'manager' || user?.role === 'owner'
  const isOwner = user?.role === 'owner'
  const [dialog, setDialog] = useState<'edit' | 'call' | 'status' | null>(null)

  return (
    <QueryBoundary query={machine}>
      {(data) => (
        <section>
          <PageHeader
            back={<BackLink to="/machines">All machines</BackLink>}
            title={data.model_name ? `${data.machine_code} · ${data.model_name}` : data.machine_code}
            actions={
              isStaff ? (
                <>
                  {customer.data && (
                    <Button icon={<Wrench size={16} />} onClick={() => setDialog('call')}>
                      Log a service call
                    </Button>
                  )}
                  <Button variant="outline" icon={<Pencil size={16} />} onClick={() => setDialog('edit')}>
                    Edit machine
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
              <dt>Customer</dt>
              <dd>{customer.data ? <Link className="inline-link" to={`/customers/${customer.data.id}`}>{customer.data.name}</Link> : customer.isPending ? '…' : 'Not available to you'}</dd>
              <dt>Serial number</dt>
              <dd>{data.serial_number ?? '—'}</dd>
              <dt>Status</dt>
              <dd>
                <StatusBadge table={MACHINE_STATUS} value={data.status} />
                {!data.is_active && (
                  <>
                    {' '}
                    <span className="badge badge-neutral">Deactivated</span>
                  </>
                )}
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
          <AttachmentsPanel entityType="machine" entityId={data.id} canUpload={isStaff} title="Machine files" />

          {isStaff && <MachineFormDialog open={dialog === 'edit'} onClose={() => setDialog(null)} machine={data} />}
          {isStaff && customer.data && dialog === 'call' && (
            <ServiceCallFormDialog open onClose={() => setDialog(null)} customer={{ id: customer.data.id, name: customer.data.name }} machine={{ id: data.id, machine_code: data.machine_code }} />
          )}
          {isOwner && (
            <ConfirmDialog
              open={dialog === 'status'}
              tone={data.is_active ? 'danger' : 'default'}
              title={data.is_active ? `Deactivate ${data.machine_code}?` : `Reactivate ${data.machine_code}?`}
              message={data.is_active ? 'The machine is marked deactivated. Its service history and files are kept, and you can reactivate it at any time.' : 'The machine becomes active again.'}
              confirmLabel={data.is_active ? 'Deactivate' : 'Reactivate'}
              busy={update.isPending}
              onCancel={() => setDialog(null)}
              onConfirm={() =>
                update.mutate(
                  { id: data.id, patch: { is_active: !data.is_active } },
                  {
                    onSuccess: () => toast.success(data.is_active ? 'Machine deactivated.' : 'Machine reactivated.'),
                    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not change the machine.'),
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
