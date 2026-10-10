import { Check, Circle } from 'lucide-react'
import type { Assignment, ServiceReport, ServiceStatus, Visit } from './queries'

/**
 * Where a call is on the way from logged to closed. Derived only from what the API returned for
 * this call (assignments, visits, reports, status); the words carry the meaning, not the colour.
 */
export function WorkflowSteps({
  status,
  assignments,
  visits,
  reports,
}: {
  status: ServiceStatus
  assignments: readonly Assignment[]
  visits: readonly Visit[]
  reports: readonly ServiceReport[]
}) {
  const closed = status === 'resolved' || status === 'closed'
  const steps = [
    { key: 'logged', label: 'Logged', done: true },
    { key: 'assigned', label: 'Assigned', done: assignments.some((a) => a.is_active) },
    { key: 'visit', label: 'Visit recorded', done: visits.length > 0 },
    { key: 'report', label: 'Report submitted', done: reports.length > 0 },
    { key: 'reviewed', label: 'Report reviewed', done: reports.some((r) => r.reviewed_at !== null) },
    { key: 'resolved', label: 'Resolved', done: closed },
  ]
  const next = steps.find((step) => !step.done)?.key
  return (
    <ol className="workflow" aria-label="Progress of this call">
      {steps.map((step) => (
        <li key={step.key} className={step.done ? 'done' : step.key === next ? 'next' : ''}>
          {step.done ? <Check size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
          <span>
            {step.label}
            <span className="visually-hidden">{step.done ? ' - done' : step.key === next ? ' - next step' : ' - not yet'}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
