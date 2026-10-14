import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select, Textarea } from '@/components/ui/fields'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { leaveDays } from '@/lib/dates'
import { LEAVE_KIND, type LeaveKind } from '@/lib/labels'
import { applyApiError } from '@/lib/forms'
import { useApplyLeave } from './queries'

interface LeaveFormValues {
  start_date: string
  end_date: string
  reason: string
  leave_kind: LeaveKind
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
  } = useForm<LeaveFormValues>({ defaultValues: { start_date: today, end_date: today, reason: '', leave_kind: 'full_day' } })

  const [start, end, kind] = useWatch({ control, name: ['start_date', 'end_date', 'leave_kind'] })
  const halfDay = kind === 'half_day'
  const days = start && end && end >= start ? leaveDays(kind, start, halfDay ? start : end) : null

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    apply.mutate(
      {
        start_date: values.start_date,
        end_date: values.leave_kind === 'half_day' ? values.start_date : values.end_date,
        reason: values.reason.trim() || null,
        leave_kind: values.leave_kind,
      },
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
        <Select
          label="Type of leave"
          options={(Object.keys(LEAVE_KIND) as LeaveKind[]).map((value) => ({ value, label: LEAVE_KIND[value] }))}
          hint={
            kind === 'comp_off'
              ? 'A day off in return for working on a weekly off or a holiday. It does not use up your leave - say which day you worked in the reason.'
              : kind === 'half_day'
                ? 'You work the other half of the day; it counts as half a day of leave.'
                : undefined
          }
          {...register('leave_kind')}
        />
        <div className="form-grid two">
          <Input
            label={halfDay ? 'Date' : 'From'}
            type="date"
            required
            error={errors.start_date?.message}
            {...register('start_date', { required: 'Choose the first day of leave.' })}
          />
          {!halfDay && (
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
          )}
        </div>
        {days !== null && (
          <p aria-live="polite" style={{ fontSize: 13 }}>
            {kind === 'comp_off' ? 'Compensatory off - counts as 0 days of leave' : `${days} ${days === 1 ? 'day' : 'days'} of leave`}
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
