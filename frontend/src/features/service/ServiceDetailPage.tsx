import { Building2, ClipboardCheck, Cpu, Pencil, Plus, UserMinus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AttachmentsPanel } from '@/features/attachments/AttachmentsPanel'
import { useAuth } from '@/features/auth/authContext'
import { useCan } from '@/features/permissions/usePermissions'
import { usePeople } from '@/features/people/usePeople'
import { useSubtree } from '@/features/team/queries'
import { formatDate, formatDateTime } from '@/lib/dates'
import { CONTACT_METHOD, MACHINE_STATUS, PRIORITY, SERVICE_STATUS, SERVICE_TYPE, VISIT_TYPE, labelOf, optionsOf } from '@/lib/labels'
import { AssignEmployeeDialog } from './AssignEmployeeDialog'
import { ReportDialog } from './ReportDialog'
import { ReviewReportDialog } from './ReviewReportDialog'
import { VisitDialog } from './VisitDialog'
import {
  useAssignments,
  useCustomer,
  useCustomerContacts,
  useMachine,
  useServiceCall,
  useServiceReports,
  useUnassignEmployee,
  useUpdateCallStatus,
  useVisits,
  type Assignment,
  type ServiceCall,
  type ServiceReport,
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
  const { user } = useAuth()
  const call = useServiceCall(id)
  const assignments = useAssignments(id)
  const visits = useVisits(id)
  const reports = useServiceReports(id)
  const [visitDialog, setVisitDialog] = useState<{ open: boolean; visit: Visit | null }>({ open: false, visit: null })
  const [reportOpen, setReportOpen] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [toUnassign, setToUnassign] = useState<Assignment | null>(null)
  const [reviewing, setReviewing] = useState<ServiceReport | null>(null)
  const toast = useToast()
  const unassign = useUnassignEmployee(id)
  const can = useCan()
  const subtree = useSubtree()
  const activeAssignments = (assignments.data ?? []).filter((a) => a.is_active)
  const { nameOf } = usePeople([
    call.data?.responsible_manager_id,
    ...activeAssignments.map((a) => a.employee_id),
    ...(reports.data ?? []).flatMap((r) => [r.reviewed_by, r.employee_id]),
    ...(visits.data ?? []).map((v) => v.employee_id),
  ])

  return (
    <QueryBoundary query={call}>
      {(data) => {
        // What to offer comes from facts on the record plus the caller's own grants; the server decides.
        const isManager = user?.role === 'manager'
        const responsible = data.responsible_manager_id
        const manages =
          isManager && (responsible === user.id || subtree.ids.has(responsible))
        const canAssign =
          manages || (isManager && can('assign_employees_to_service_call', { type: 'user', id: responsible }))
        const isAssigned = activeAssignments.some((a) => a.employee_id === user?.id)
        const canWork = manages || isAssigned
        const canReview = isManager && responsible === user.id
        return (
        <section>
          <PageHeader
            back={<BackLink to="/service">{user?.role === 'employee' ? 'All service calls' : 'Service calls'}</BackLink>}
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
              <dd>{activeAssignments.length ? activeAssignments.map((a) => nameOf(a.employee_id, '…')).join(', ') : 'Nobody assigned yet'}</dd>
              {data.resolution && (
                <>
                  <dt>Resolution</dt>
                  <dd className="prose">{data.resolution}</dd>
                </>
              )}
            </dl>
          </Section>

          <CustomerAndMachine call={data} />

          {(isManager || user?.role === 'owner') && (
            <Section
              title="Assigned team"
              action={
                canAssign ? (
                  <Button size="sm" icon={<UserPlus size={16} />} onClick={() => setAssigning(true)}>
                    Assign someone
                  </Button>
                ) : undefined
              }
            >
              {activeAssignments.length === 0 ? (
                <p>Nobody is assigned to this call yet.</p>
              ) : (
                <ul style={{ listStyle: 'none' }} className="stack">
                  {activeAssignments.map((assignment) => (
                    <li key={assignment.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                      <span>
                        <strong>{nameOf(assignment.employee_id, '…')}</strong>
                        {assignment.role_in_call ? ` · ${assignment.role_in_call}` : ''}
                        <span> · since {formatDate(assignment.assigned_at)}</span>
                      </span>
                      {canAssign && (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<UserMinus size={14} />}
                          onClick={() => setToUnassign(assignment)}
                          aria-label={`Remove ${nameOf(assignment.employee_id, 'person')} from this call`}
                        >
                          Remove
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {canWork && (
            <Section title="Update status">
              <StatusControl key={`${data.id}-${data.status}`} call={data} />
            </Section>
          )}

          <Section
            title="Visits & support sessions"
            action={
              canWork ? (
                <Button size="sm" icon={<Plus size={16} />} onClick={() => setVisitDialog({ open: true, visit: null })}>
                  Record a visit
                </Button>
              ) : undefined
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
                        {/* Your own visits, or any visit if you manage the call; the server enforces it too. */}
                        {(visit.employee_id === user?.id || manages) && (
                          <Button size="sm" variant="outline" icon={<Pencil size={14} />} onClick={() => setVisitDialog({ open: true, visit })}>
                            Edit
                          </Button>
                        )}
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
              isAssigned ? (
                <Button size="sm" icon={<Plus size={16} />} onClick={() => setReportOpen(true)}>
                  Submit report
                </Button>
              ) : undefined
            }
          >
            <QueryBoundary
              query={reports}
              isEmpty={(rows) => rows.length === 0}
              empty={<p>{isAssigned ? "You haven't submitted a report for this call yet." : 'No report has been submitted for this call yet.'}</p>}
            >
              {(rows) => (
                <ul style={{ listStyle: 'none' }} className="stack">
                  {rows.map((report) => (
                    <li key={report.id} className="glass-card" style={{ padding: 14 }}>
                      <div className="meta-line">
                        <strong>
                          {report.employee_id === user?.id ? 'Submitted' : `${nameOf(report.employee_id, '…')} submitted`} {formatDateTime(report.submitted_at)}
                        </strong>
                        {report.reviewed_at ? (
                          <span className="badge badge-success">
                            Reviewed by {nameOf(report.reviewed_by, 'manager')} · {formatDateTime(report.reviewed_at)}
                          </span>
                        ) : (
                          <span className="badge badge-warning">Awaiting review</span>
                        )}
                        {canReview && !report.reviewed_at && (
                          <Button size="sm" variant="success" icon={<ClipboardCheck size={14} />} onClick={() => setReviewing(report)}>
                            Review
                          </Button>
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
                      <AttachmentsPanel
                        entityType="service_report"
                        entityId={report.id}
                        canUpload={report.employee_id === user?.id || canReview}
                        title="Report files"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </QueryBoundary>
          </Section>

          <AttachmentsPanel entityType="service_call" entityId={data.id} canUpload={canWork} title="Call files" />

          <VisitDialog
            call={data}
            visit={visitDialog.visit}
            open={visitDialog.open}
            onClose={() => setVisitDialog((current) => ({ ...current, open: false }))}
          />
          <ReportDialog call={data} visits={visits.data ?? []} open={reportOpen} onClose={() => setReportOpen(false)} />
          {canAssign && (
            <AssignEmployeeDialog
              callId={data.id}
              assignedIds={new Set(activeAssignments.map((a) => a.employee_id))}
              open={assigning}
              onClose={() => setAssigning(false)}
            />
          )}
          <ReviewReportDialog callId={data.id} report={reviewing} onClose={() => setReviewing(null)} />
          <ConfirmDialog
            open={toUnassign !== null}
            tone="danger"
            title="Remove from this call?"
            message={toUnassign ? `${nameOf(toUnassign.employee_id, 'This person')} will no longer be assigned to ${data.service_call_code}. Their visits and reports stay on record.` : ''}
            confirmLabel="Remove"
            busy={unassign.isPending}
            onCancel={() => setToUnassign(null)}
            onConfirm={() => {
              if (!toUnassign) return
              unassign.mutate(toUnassign.id, {
                onSuccess: () => toast.success('Removed from the call.'),
                onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove this person.'),
                onSettled: () => setToUnassign(null),
              })
            }}
          />
        </section>
        )
      }}
    </QueryBoundary>
  )
}
