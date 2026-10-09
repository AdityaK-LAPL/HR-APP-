import { Building2, Cpu, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AttachmentsPanel } from '@/features/attachments/AttachmentsPanel'
import { usePeople } from '@/features/people/usePeople'
import { formatDate, formatDateTime } from '@/lib/dates'
import { CONTACT_METHOD, MACHINE_STATUS, PRIORITY, SERVICE_STATUS, SERVICE_TYPE, VISIT_TYPE, labelOf, optionsOf } from '@/lib/labels'
import { ReportDialog } from './ReportDialog'
import { VisitDialog } from './VisitDialog'
import {
  useAssignments,
  useCustomer,
  useCustomerContacts,
  useMachine,
  useServiceCall,
  useServiceReports,
  useUpdateCallStatus,
  useVisits,
  type ServiceCall,
  type ServiceStatus,
  type Visit,
} from './queries'

function CustomerAndMachine({ call }: { call: ServiceCall }) {
  const customer = useCustomer(call.customer_id)
  const contacts = useCustomerContacts(call.customer_id)
  const machine = useMachine(call.machine_id)
  return (
    <div className="form-grid two">
      <Section title="Customer">
        {customer.isPending ? (
          <p>Loading…</p>
        ) : customer.data ? (
          <>
            <p className="meta-line">
              <Building2 size={14} aria-hidden="true" />
              <strong>{customer.data.name}</strong> · {customer.data.customer_code}
            </p>
            {customer.data.address && <p className="prose">{customer.data.address}</p>}
            {(contacts.data ?? []).length > 0 && (
              <ul style={{ listStyle: 'none', marginTop: 10 }} className="stack">
                {contacts.data!.map((contact) => (
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
          </>
        ) : (
          <p>Customer details are not available to you.</p>
        )}
      </Section>
      <Section title="Machine">
        {machine.isPending ? (
          <p>Loading…</p>
        ) : machine.data ? (
          <dl className="facts">
            <dt>Machine</dt>
            <dd>
              <Cpu size={14} aria-hidden="true" /> {machine.data.machine_code}
            </dd>
            <dt>Model</dt>
            <dd>{machine.data.model_name ?? '—'}</dd>
            <dt>Serial</dt>
            <dd>{machine.data.serial_number ?? '—'}</dd>
            <dt>Location</dt>
            <dd>{machine.data.location ?? '—'}</dd>
            <dt>Status</dt>
            <dd>
              <StatusBadge table={MACHINE_STATUS} value={machine.data.status} />
            </dd>
            <dt>Warranty</dt>
            <dd>{machine.data.warranty_info ?? '—'}</dd>
          </dl>
        ) : (
          <p>Machine details are not available to you.</p>
        )}
      </Section>
    </div>
  )
}

function StatusControl({ call }: { call: ServiceCall }) {
  const toast = useToast()
  const update = useUpdateCallStatus()
  const [selected, setSelected] = useState<ServiceStatus>(call.status)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="stack">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <Select
          label="Call status"
          value={selected}
          onChange={(event) => setSelected(event.target.value as ServiceStatus)}
          options={optionsOf(SERVICE_STATUS)}
        />
        <Button
          disabled={selected === call.status}
          loading={update.isPending}
          onClick={() => {
            setError(null)
            update.mutate(
              { id: call.id, status: selected },
              {
                onSuccess: () => toast.success(`Status changed to “${SERVICE_STATUS[selected].label}”.`),
                onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not update the status.'),
              },
            )
          }}
        >
          Save status
        </Button>
      </div>
    </div>
  )
}

export function ServiceDetailPage() {
  const { id = '' } = useParams()
  const call = useServiceCall(id)
  const assignments = useAssignments(id)
  const visits = useVisits(id)
  const reports = useServiceReports(id)
  const [visitDialog, setVisitDialog] = useState<{ open: boolean; visit: Visit | null }>({ open: false, visit: null })
  const [reportOpen, setReportOpen] = useState(false)
  const activeAssignments = (assignments.data ?? []).filter((a) => a.is_active)
  const { nameOf } = usePeople([
    call.data?.responsible_manager_id,
    ...activeAssignments.map((a) => a.employee_id),
    ...(reports.data ?? []).map((r) => r.reviewed_by),
  ])

  return (
    <QueryBoundary query={call}>
      {(data) => (
        <section>
          <PageHeader
            back={<BackLink to="/service">All service calls</BackLink>}
            title={`Call ${data.service_call_code}`}
            description={data.issue_reported}
          />

          <Section title="Details">
            <dl className="facts">
              <dt>Status</dt>
              <dd>
                <StatusBadge table={SERVICE_STATUS} value={data.status} />
              </dd>
              <dt>Priority</dt>
              <dd>
                <StatusBadge table={PRIORITY} value={data.priority} />
              </dd>
              <dt>Type</dt>
              <dd>{labelOf(SERVICE_TYPE, data.service_type)}</dd>
              <dt>Reported</dt>
              <dd>
                {formatDateTime(data.contacted_at)} · {labelOf(CONTACT_METHOD, data.contact_method)}
              </dd>
              <dt>Responsible manager</dt>
              <dd>{nameOf(data.responsible_manager_id, '…')}</dd>
              <dt>Team on this call</dt>
              <dd>{activeAssignments.length ? activeAssignments.map((a) => nameOf(a.employee_id, '…')).join(', ') : '—'}</dd>
              {data.resolution && (
                <>
                  <dt>Resolution</dt>
                  <dd className="prose">{data.resolution}</dd>
                </>
              )}
            </dl>
          </Section>

          <CustomerAndMachine call={data} />

          <Section title="Update status">
            <StatusControl key={`${data.id}-${data.status}`} call={data} />
          </Section>

          <Section
            title="Visits & support sessions"
            action={
              <Button size="sm" icon={<Plus size={16} />} onClick={() => setVisitDialog({ open: true, visit: null })}>
                Record a visit
              </Button>
            }
          >
            <QueryBoundary query={visits} isEmpty={(rows) => rows.length === 0} empty={<p>No visits recorded yet.</p>}>
              {(rows) => (
                <ul style={{ listStyle: 'none' }} className="stack">
                  {rows.map((visit) => (
                    <li key={visit.id} className="glass-card" style={{ padding: 14 }}>
                      <div className="page-header-row">
                        <div>
                          <strong>{labelOf(VISIT_TYPE, visit.visit_type)}</strong> · {formatDate(visit.visit_date) || 'undated'}
                          <div className="meta-line">
                            <span>by {nameOf(visit.employee_id, '…')}</span>
                            {visit.arrival_time && <span>arrived {formatDateTime(visit.arrival_time)}</span>}
                            {visit.departure_time && <span>left {formatDateTime(visit.departure_time)}</span>}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" icon={<Pencil size={14} />} onClick={() => setVisitDialog({ open: true, visit })}>
                          Edit
                        </Button>
                      </div>
                      {visit.work_performed && <p className="prose" style={{ marginTop: 8 }}>{visit.work_performed}</p>}
                      {visit.problem_found && <p className="meta-line">Problem: {visit.problem_found}</p>}
                      {visit.result && <p className="meta-line">Result: {visit.result}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </QueryBoundary>
          </Section>

          <Section
            title="Service report"
            action={
              <Button size="sm" icon={<Plus size={16} />} onClick={() => setReportOpen(true)}>
                Submit report
              </Button>
            }
          >
            <QueryBoundary query={reports} isEmpty={(rows) => rows.length === 0} empty={<p>You haven&apos;t submitted a report for this call yet.</p>}>
              {(rows) => (
                <ul style={{ listStyle: 'none' }} className="stack">
                  {rows.map((report) => (
                    <li key={report.id} className="glass-card" style={{ padding: 14 }}>
                      <div className="meta-line">
                        <strong>Submitted {formatDateTime(report.submitted_at)}</strong>
                        {report.reviewed_at ? (
                          <span className="badge badge-success">
                            Reviewed by {nameOf(report.reviewed_by, 'manager')} · {formatDateTime(report.reviewed_at)}
                          </span>
                        ) : (
                          <span className="badge badge-warning">Awaiting review</span>
                        )}
                      </div>
                      <dl className="facts" style={{ marginTop: 10 }}>
                        {([
                          ['Work performed', report.work_performed],
                          ['Problem found', report.problem_found],
                          ['Root cause', report.root_cause],
                          ['Action taken', report.action_taken],
                          ['Parts used', report.parts_used],
                          ['Result', report.result],
                          ['Pending work', report.pending_work],
                          ['Recommendations', report.recommendations],
                          ['Your comments', report.employee_comments],
                        ] as const)
                          .filter(([, value]) => Boolean(value))
                          .map(([label, value]) => (
                            <div key={label} style={{ display: 'contents' }}>
                              <dt>{label}</dt>
                              <dd className="prose">{value}</dd>
                            </div>
                          ))}
                      </dl>
                      <AttachmentsPanel entityType="service_report" entityId={report.id} canUpload title="Report files" />
                    </li>
                  ))}
                </ul>
              )}
            </QueryBoundary>
          </Section>

          <AttachmentsPanel entityType="service_call" entityId={data.id} canUpload title="Call files" />

          <VisitDialog
            call={data}
            visit={visitDialog.visit}
            open={visitDialog.open}
            onClose={() => setVisitDialog((current) => ({ ...current, open: false }))}
          />
          <ReportDialog call={data} visits={visits.data ?? []} open={reportOpen} onClose={() => setReportOpen(false)} />
        </section>
      )}
    </QueryBoundary>
  )
}
