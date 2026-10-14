import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Textarea } from '@/components/ui/fields'
import { formatDate, leaveDays } from '@/lib/dates'
import { LEAVE_KIND } from '@/lib/labels'
import { useDecideLeave, type Leave } from './queries'

export type Decision = { leave: Leave; kind: 'approve' | 'reject'; who: string }

/** Approve (optional note) or reject (reason required) a leave request. Confirmation is the dialog itself. */
export function DecideLeaveDialog({ decision, onClose }: { decision: Decision | null; onClose: () => void }) {
  return (
    <Dialog
      open={decision !== null}
      onClose={onClose}
      title={decision?.kind === 'reject' ? 'Reject leave request' : 'Approve leave request'}
    >
      {decision && <DecisionForm decision={decision} onClose={onClose} />}
    </Dialog>
  )
}

function DecisionForm({ decision, onClose }: { decision: Decision; onClose: () => void }) {
  const toast = useToast()
  const decide = useDecideLeave()
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { leave, kind, who } = decision
  const rejecting = kind === 'reject'
  const days = leaveDays(leave.leave_kind, leave.start_date, leave.end_date)
  const range =
    leave.start_date === leave.end_date ? formatDate(leave.start_date) : `${formatDate(leave.start_date)} – ${formatDate(leave.end_date)}`

  return (
    <div className="stack">
      {error && <Alert tone="error">{error}</Alert>}
      <p>
        <strong>{who}</strong> · {range} · {leave.leave_kind === 'full_day' ? '' : `${LEAVE_KIND[leave.leave_kind]} · `}{days} {days === 1 ? 'day' : 'days'}
        {leave.reason ? ` · “${leave.reason}”` : ''}
      </p>
      <Textarea
        label={rejecting ? 'Reason for rejecting' : 'Note to the employee'}
        required={rejecting}
        hint={rejecting ? 'The employee sees this reason.' : 'Optional.'}
        rows={3}
        value={comments}
        onChange={(event) => setComments(event.target.value)}
      />
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={decide.isPending}>
          Cancel
        </Button>
        <Button
          variant={rejecting ? 'danger' : 'success'}
          loading={decide.isPending}
          disabled={rejecting && comments.trim().length === 0}
          onClick={() => {
            setError(null)
            decide.mutate(
              { id: leave.id, decision: kind, comments: comments.trim() || null },
              {
                onSuccess: () => {
                  toast.success(rejecting ? 'Leave request rejected.' : 'Leave request approved.')
                  onClose()
                },
                onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not record the decision.'),
              },
            )
          }}
        >
          {rejecting ? 'Reject request' : 'Approve request'}
        </Button>
      </div>
    </div>
  )
}
