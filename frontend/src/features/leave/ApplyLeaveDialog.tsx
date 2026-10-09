import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/fields'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { inclusiveDays } from '@/lib/dates'
import { applyApiError } from '@/lib/forms'
import { useApplyLeave } from './queries'

interface LeaveFormValues {
  start_date: string
  end_date: string
  reason: string
}

/** Apply for leave. The server routes the request to your manager; nothing is decided here. */
export function ApplyLeaveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const apply = useApplyLeave()
  return (
    <Dialog open={open} onClose={onClose} title="Apply for leave" dismissible={!apply.isPending}>
      {/* Mounted only while open, so every opening starts from a fresh form. */}
      <LeaveForm onClose={onClose} apply={apply} />
    </Dialog>
  )
}

function LeaveForm({ onClose, apply }: { onClose: () => void; apply: ReturnType<typeof useApplyLeave> }) {
  const toast = useToast()
  const today = useCompanyToday()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<LeaveFormValues>({ defaultValues: { start_date: today, end_date: today, reason: '' } })

  const [start, end] = useWatch({ control, name: ['start_date', 'end_date'] })
  const days = start && end && end >= start ? inclusiveDays(start, end) : null

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    apply.mutate(
      { start_date: values.start_date, end_date: values.end_date, reason: values.reason.trim() || null },
      {
        onSuccess: () => {
          toast.success('Leave request sent for approval.')
          onClose()
        },
        onError: (error) => setFormError(applyApiError(error, setError, ['start_date', 'end_date', 'reason'])),
      },
    )
  })

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="stack">
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className="form-grid two">
          <Input
            label="From"
            type="date"
            required
            error={errors.start_date?.message}
            {...register('start_date', { required: 'Choose the first day of leave.' })}
          />
          <Input
            label="To"
            type="date"
            required
            error={errors.end_date?.message}
            {...register('end_date', {
              required: 'Choose the last day of leave.',
              validate: (value, form) => value >= form.start_date || 'The last day cannot be before the first day.',
            })}
          />
        </div>
        {days !== null && (
          <p aria-live="polite" style={{ fontSize: 13 }}>
            {days} {days === 1 ? 'day' : 'days'} of leave
          </p>
        )}
        <Textarea
          label="Reason"
          hint="Optional, but it helps your manager decide."
          rows={3}
          error={errors.reason?.message}
          {...register('reason')}
        />
        <div className="form-actions">
          <Button variant="outline" onClick={onClose} disabled={apply.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={apply.isPending}>
            Send request
          </Button>
        </div>
      </form>
    </>
  )
}
