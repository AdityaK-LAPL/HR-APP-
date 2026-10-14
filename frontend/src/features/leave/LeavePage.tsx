import { CalendarDays, Plus } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { useToast } from '@/components/feedback/toastContext'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { usePeople } from '@/features/people/usePeople'
import { formatDate, formatDateTime, leaveDays } from '@/lib/dates'
import { LEAVE_KIND } from '@/lib/labels'
import { LEAVE_STATUS, optionsOf } from '@/lib/labels'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { ApplyLeaveDialog } from './ApplyLeaveDialog'
import { useCancelLeave, useLeaves, type Leave } from './queries'

const PAGE_SIZE = 20

export function LeavePage() {
  const toast = useToast()
  const [params, setParams] = useUrlParams({ status: '', page: '1' })
  const page = pageNumber(params.page)
  const query = useLeaves({ ...(params.status ? { status: params.status } : {}), page, page_size: PAGE_SIZE })
  const cancel = useCancelLeave()
  const [applying, setApplying] = useState(false)
  const [toCancel, setToCancel] = useState<Leave | null>(null)
  const { nameOf } = usePeople((query.data?.items ?? []).map((leave) => leave.current_approver_id))

  const columns: Column<Leave>[] = [
    {
      key: 'dates',
      header: 'Dates',
      primary: true,
      cell: (l) =>
        l.start_date === l.end_date ? formatDate(l.start_date) : `${formatDate(l.start_date)} – ${formatDate(l.end_date)}`,
    },
    { key: 'kind', header: 'Type', cell: (l) => LEAVE_KIND[l.leave_kind] },
    {
      key: 'days',
      header: 'Days',
      cell: (l) => leaveDays(l.leave_kind, l.start_date, l.end_date),
    },
    { key: 'status', header: 'Status', cell: (l) => <StatusBadge table={LEAVE_STATUS} value={l.status} /> },
    {
      key: 'approver',
      header: 'Waiting on',
      cell: (l) => (l.status === 'pending' && l.current_approver_id ? nameOf(l.current_approver_id, '…') : '—'),
    },
    { key: 'reason', header: 'Reason', hideOnPhone: true, cell: (l) => l.reason ?? '—' },
    { key: 'applied', header: 'Applied', hideOnPhone: true, cell: (l) => formatDateTime(l.created_at) },
    {
      key: 'actions',
      header: 'Actions',
      cell: (l) =>
        l.status === 'pending' ? (
          <Button size="sm" variant="outline" onClick={() => setToCancel(l)}>
            Cancel request
          </Button>
        ) : null,
    },
  ]

  return (
    <section>
      <PageHeader
        title="My leave"
        description="Apply for leave and follow each request."
        actions={
          <Button icon={<Plus size={18} />} onClick={() => setApplying(true)}>
            Apply for leave
          </Button>
        }
      />
      <div className="toolbar">
        <Select
          label="Status"
          value={params.status}
          onChange={(event) => setParams({ status: event.target.value })}
          options={optionsOf(LEAVE_STATUS)}
          placeholder="All statuses"
        />
      </div>

      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<CalendarDays size={24} />}
            title={params.status ? 'No leave requests with that status' : 'No leave requests yet'}
            description="Use “Apply for leave” to send your first request."
          />
        }
      >
        {(data) => (
          <>
            <RecordList rows={data.items} columns={columns} rowKey={(l) => l.id} caption="Leave requests" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
          </>
        )}
      </QueryBoundary>

      <ApplyLeaveDialog open={applying} onClose={() => setApplying(false)} />
      <ConfirmDialog
        open={toCancel !== null}
        tone="danger"
        title="Cancel this leave request?"
        message={
          toCancel
            ? `Your request for ${formatDate(toCancel.start_date)}${toCancel.start_date === toCancel.end_date ? '' : ` – ${formatDate(toCancel.end_date)}`} will be withdrawn.`
            : ''
        }
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
