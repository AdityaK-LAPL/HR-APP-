import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Textarea } from '@/components/ui/fields'
import { useReviewReport, type ServiceReport } from './queries'

/** Mark a submitted service report as reviewed, with an optional comment. */
export function ReviewReportDialog({
  callId,
  report,
  onClose,
}: {
  callId: string
  report: ServiceReport | null
  onClose: () => void
}) {
  return (
    <Dialog open={report !== null} onClose={onClose} title="Review service report">
      {report && <ReviewForm callId={callId} report={report} onClose={onClose} />}
    </Dialog>
  )
}

function ReviewForm({ callId, report, onClose }: { callId: string; report: ServiceReport; onClose: () => void }) {
  const toast = useToast()
  const review = useReviewReport(callId)
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="stack">
      {error && <Alert tone="error">{error}</Alert>}
      <p>Mark this report as reviewed. Reviewing records your name and the time on the report.</p>
      {report.result && <p className="prose">Result reported: {report.result}</p>}
      <Textarea label="Comments" hint="Optional." rows={3} value={comments} onChange={(event) => setComments(event.target.value)} />
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={review.isPending}>
          Cancel
        </Button>
        <Button
          variant="success"
          loading={review.isPending}
          onClick={() => {
            setError(null)
            review.mutate(
              { id: report.id, comments: comments.trim() || null },
              {
                onSuccess: () => {
                  toast.success('Report marked as reviewed.')
                  onClose()
                },
                onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not review the report.'),
              },
            )
          }}
        >
          Mark as reviewed
        </Button>
      </div>
    </div>
  )
}
