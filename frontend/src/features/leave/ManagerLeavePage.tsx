import { CalendarDays, Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/features/auth/authContext'
import { usePeople } from '@/features/people/usePeople'
import { useVisiblePeopleOptions } from '@/features/team/queries'
import { formatDate, formatDateTime, inclusiveDays } from '@/lib/dates'
import { LEAVE_STATUS, optionsOf } from '@/lib/labels'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { ApplyLeaveDialog } from './ApplyLeaveDialog'
import { DecideLeaveDialog, type Decision } from './DecideLeaveDialog'
import { useCancelLeave, useLeaves, type Leave } from './queries'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/feedback/toastContext'
import { ApiError } from '@/api/errors'

const PAGE_SIZE = 20

/**
 * Leave for a manager: requests from the team (approve / reject the ones waiting on me) and the
 * manager's own leave. Whether a request is mine to decide is a fact on the record
 * (`current_approver_id`); the server enforces it again.
 */
export function ManagerLeavePage() {
  const { user } = useAuth()
  const toast = useToast()
  const [params, setParams] = useUrlParams({ view: 'team', status: '', person: '', page: '1' })
  const mine = params.view === 'mine'
  // Team requests open on "Pending" (what needs a decision); "all" is an explicit choice.
  const status = params.status || (mine ? 'all' : 'pending')
  const page = pageNumber(params.page)
  const people = useVisiblePeopleOptions()
  const [applying, setApplying] = useState(false)
  const [deciding, setDeciding] = useState<Decision | null>(null)
  const [toCancel, setToCancel] = useState<Leave | null>(null)
  const cancel = useCancelLeave()

  const query = useLeaves({
    ...(status !== 'all' ? { status } : {}),
    ...(mine ? { employee_id: user?.id ?? '' } : params.person ? { employee_id: params.person } : {}),
    page,
    page_size: PAGE_SIZE,
  })
  const { nameOf } = usePeople((query.data?.items ?? []).flatMap((leave) => [leave.employee_id, leave.current_approver_id]))

  const range = (l: Leave) =>
    l.start_date === l.end_date ? formatDate(l.start_date) : `${formatDate(l.start_date)} – ${formatDate(l.end_date)}`

  const columns: Column<Leave>[] = [
    ...(mine ? [] : [{ key: 'who', header: 'Employee', primary: true, cell: (l: Leave) => nameOf(l.employee_id, '…') }]),
    { key: 'dates', header: 'Dates', primary: mine, cell: range },
    { key: 'days', header: 'Days', cell: (l) => inclusiveDays(l.start_date, l.end_date) },
    { key: 'status', header: 'Status', cell: (l) => <StatusBadge table={LEAVE_STATUS} value={l.status} /> },
    {
      key: 'approver',
      header: 'Waiting on',
      cell: (l) =>
        l.status !== 'pending' ? '—' : l.current_approver_id === user?.id ? 'You' : nameOf(l.current_approver_id, '…'),
    },
    { key: 'reason', header: 'Reason', hideOnPhone: true, cell: (l) => <span className="clamp-2">{l.reason ?? '—'}</span> },
    { key: 'applied', header: 'Applied', hideOnPhone: true, cell: (l) => formatDateTime(l.created_at) },
    {
      key: 'actions',
      header: 'Actions',
      cell: (l) => {
        if (l.status !== 'pending') return null
        if (l.employee_id === user?.id) {
          return (
            <Button size="sm" variant="outline" onClick={() => setToCancel(l)}>
              Cancel request
            </Button>
          )
        }
        if (l.current_approver_id !== user?.id) return null
        const who = nameOf(l.employee_id, 'Employee')
        return (
          <span className="meta-line">
            <Button size="sm" variant="success" icon={<Check size={14} />} onClick={() => setDeciding({ leave: l, kind: 'approve', who })} aria-label={`Approve leave for ${who}`}>
              Approve
            </Button>
            <Button size="sm" variant="outline" icon={<X size={14} />} onClick={() => setDeciding({ leave: l, kind: 'reject', who })} aria-label={`Reject leave for ${who}`}>
              Reject
            </Button>
          </span>
        )
      },
    },
  ]

  return (
    <section>
      <PageHeader
        title="Leave"
        description="Decide your team's leave requests and manage your own leave."
        actions={
          <Button icon={<Plus size={18} />} onClick={() => setApplying(true)}>
            Apply for leave
          </Button>
        }
      />
      <SegmentedControl
        label="Leave view"
        value={mine ? 'mine' : 'team'}
        onChange={(view) => setParams({ view, status: '', person: '' })}
        options={[
          { value: 'team', label: 'Team requests' },
          { value: 'mine', label: 'My leave' },
        ]}
      />
      <div className="toolbar">
        {!mine && (
          <Select
            label="Employee"
            value={params.person}
            onChange={(event) => setParams({ person: event.target.value })}
            options={people.options.filter((option) => option.value !== user?.id)}
            placeholder="Everyone"
          />
        )}
        <Select
          label="Status"
          value={status}
          onChange={(event) => setParams({ status: event.target.value })}
          options={[{ value: 'all', label: 'All statuses' }, ...optionsOf(LEAVE_STATUS)]}
        />
      </div>

      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<CalendarDays size={24} />}
            title={mine ? 'No leave requests yet' : status === 'pending' ? 'Nothing waiting for a decision' : 'No leave requests match'}
            description={mine ? 'Use “Apply for leave” to send a request to your manager.' : 'Try another status or employee.'}
          />
        }
      >
        {(data) => (
          <>
            <RecordList rows={data.items} columns={columns} rowKey={(l) => l.id} caption={mine ? 'My leave requests' : 'Team leave requests'} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
          </>
        )}
      </QueryBoundary>

      <ApplyLeaveDialog open={applying} onClose={() => setApplying(false)} />
      <DecideLeaveDialog decision={deciding} onClose={() => setDeciding(null)} />
      <ConfirmDialog
        open={toCancel !== null}
        tone="danger"
        title="Cancel this leave request?"
        message={toCancel ? `Your request for ${range(toCancel)} will be withdrawn.` : ''}
        confirmLabel="Cancel request"
        cancelLabel="Keep request"
        busy={cancel.isPending}
        onCancel={() => setToCancel(null)}
        onConfirm={() => {
          if (!toCancel) return
          cancel.mutate(toCancel.id, {
            onSuccess: () => toast.success('Leave request cancelled.'),
            onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not cancel the request.'),
            onSettled: () => setToCancel(null),
          })
        }}
      />
    </section>
  )
}
