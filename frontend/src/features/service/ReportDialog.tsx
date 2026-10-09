import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select, Textarea } from '@/components/ui/fields'
import { companyLocalToIso, formatDate, isoToCompanyLocal } from '@/lib/dates'
import { applyApiError } from '@/lib/forms'
import { labelOf, VISIT_TYPE } from '@/lib/labels'
import { useSubmitReport, type ServiceCall, type Visit } from './queries'

interface ReportForm {
  service_visit_id: string
  report_datetime: string
  work_performed: string
  problem_found: string
  root_cause: string
  action_taken: string
  parts_used: string
  result: string
  pending_work: string
  recommendations: string
  employee_comments: string
}

const FIELDS = [
  'service_visit_id', 'report_datetime', 'work_performed', 'problem_found', 'root_cause', 'action_taken',
  'parts_used', 'result', 'pending_work', 'recommendations', 'employee_comments',
] as const

const REQUIRED = (message: string) => ({ validate: (v: string) => v.trim().length > 0 || message })

/** The final service report for a call. Once submitted it is the employee's record; a manager reviews it. */
export function ReportDialog({
  call,
  visits,
  open,
  onClose,
}: {
  call: ServiceCall
  visits: readonly Visit[]
  open: boolean
  onClose: () => void
}) {
  const submit = useSubmitReport(call.id)
  return (
    <Dialog open={open} onClose={onClose} title={`Service report · ${call.service_call_code}`} dismissible={!submit.isPending}>
      {/* Mounted only while open, so every opening starts from a fresh form. */}
      <ReportFormBody visits={visits} submit={submit} onClose={onClose} />
    </Dialog>
  )
}

function ReportFormBody({
  visits,
  submit,
  onClose,
}: {
  visits: readonly Visit[]
  submit: ReturnType<typeof useSubmitReport>
  onClose: () => void
}) {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ReportForm>({
    defaultValues: {
      service_visit_id: '', report_datetime: isoToCompanyLocal(new Date().toISOString()),
      work_performed: '', problem_found: '', root_cause: '', action_taken: '', parts_used: '',
      result: '', pending_work: '', recommendations: '', employee_comments: '',
    },
  })

  const onSubmit = handleSubmit((v) => {
    setFormError(null)
    const text = (value: string) => value.trim() || null
    submit.mutate(
      {
        service_visit_id: v.service_visit_id || null,
        report_datetime: v.report_datetime ? companyLocalToIso(v.report_datetime) : null,
        work_performed: text(v.work_performed),
        problem_found: text(v.problem_found),
        root_cause: text(v.root_cause),
        action_taken: text(v.action_taken),
        parts_used: text(v.parts_used),
        result: text(v.result),
        pending_work: text(v.pending_work),
        recommendations: text(v.recommendations),
        employee_comments: text(v.employee_comments),
      },
      {
        onSuccess: () => {
          toast.success('Service report submitted.')
          onClose()
        },
        onError: (error) => setFormError(applyApiError(error, setError, FIELDS)),
      },
    )
  })

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="stack">
        <Alert tone="info">Submit this when your work on the call is done. Your manager will review it.</Alert>
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className="form-grid two">
          <Select
            label="Related visit"
            placeholder="Not tied to one visit"
            options={visits.map((visit) => ({
              value: visit.id,
              label: `${labelOf(VISIT_TYPE, visit.visit_type)} · ${formatDate(visit.visit_date) || 'undated'}`,
            }))}
            {...register('service_visit_id')}
          />
          <Input label="Report time" type="datetime-local" {...register('report_datetime')} />
        </div>
        <Textarea label="Work performed" required rows={3} error={errors.work_performed?.message} {...register('work_performed', REQUIRED('Describe the work performed.'))} />
        <Textarea label="Problem found" required rows={2} error={errors.problem_found?.message} {...register('problem_found', REQUIRED('Describe the problem you found.'))} />
        <Textarea label="Root cause" rows={2} {...register('root_cause')} />
        <Textarea label="Action taken" required rows={2} error={errors.action_taken?.message} {...register('action_taken', REQUIRED('Describe the action you took.'))} />
        <Textarea label="Parts used" rows={2} {...register('parts_used')} />
        <Textarea label="Result" required rows={2} error={errors.result?.message} {...register('result', REQUIRED('Describe the result.'))} />
        <Textarea label="Pending work" rows={2} {...register('pending_work')} />
        <Textarea label="Recommendations" rows={2} {...register('recommendations')} />
        <Textarea label="Your comments" rows={2} {...register('employee_comments')} />
        <div className="form-actions">
          <Button variant="outline" onClick={onClose} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={submit.isPending}>
            Submit report
          </Button>
        </div>
      </form>
    </>
  )
}
