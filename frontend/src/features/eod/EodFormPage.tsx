import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { Select, Textarea } from '@/components/ui/fields'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { useProjects } from '@/features/projects/queries'
import { useTasks } from '@/features/tasks/queries'
import { applyApiError } from '@/lib/forms'
import { useSubmitEod } from './queries'

interface EodForm {
  report_date: string
  project_id: string
  task_id: string
  work_completed: string
  work_remaining: string
  issues: string
  notes: string
}

const FIELDS = ['report_date', 'project_id', 'task_id', 'work_completed', 'work_remaining', 'issues', 'notes'] as const

export function EodFormPage() {
  const today = useCompanyToday()
  const toast = useToast()
  const navigate = useNavigate()
  const submit = useSubmitEod()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<EodForm>({
    defaultValues: { report_date: today, project_id: '', task_id: '', work_completed: '', work_remaining: '', issues: '', notes: '' },
  })

  const reportDate = useWatch({ control, name: 'report_date' })
  const projects = useProjects({ page: 1, page_size: 100 })
  // Offer the tasks planned for the day being reported.
  const tasks = useTasks({ task_date: reportDate || today, page: 1, page_size: 100 })

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    submit.mutate(
      {
        report_date: values.report_date,
        project_id: values.project_id || null,
        task_id: values.task_id || null,
        work_completed: values.work_completed.trim() || null,
        work_remaining: values.work_remaining.trim() || null,
        issues: values.issues.trim() || null,
        notes: values.notes.trim() || null,
      },
      {
        onSuccess: (report) => {
          toast.success('End-of-day report submitted.')
          void navigate(`/eod/${report.id}`, { replace: true })
        },
        onError: (error) => setFormError(applyApiError(error, setError, FIELDS)),
      },
    )
  })

  return (
    <section>
      <PageHeader
        back={<BackLink to="/eod">All reports</BackLink>}
        title="Submit end-of-day report"
        description="Once submitted, a report is part of your work record and cannot be edited."
      />
      <form onSubmit={onSubmit} noValidate>
        <Section>
          <div className="stack">
            {formError && <Alert tone="error">{formError}</Alert>}
            <div className="form-grid two">
              <Input
                label="Report date"
                type="date"
                required
                error={errors.report_date?.message}
                {...register('report_date', { required: 'Choose the date this report covers.' })}
              />
              <Select
                label="Project"
                placeholder="No project"
                options={(projects.data?.items ?? []).map((project) => ({ value: project.id, label: project.name }))}
                error={errors.project_id?.message}
                {...register('project_id')}
              />
              <Select
                label="Related task"
                placeholder="No specific task"
                hint={`Tasks planned for ${reportDate || today}.`}
                options={(tasks.data?.items ?? []).map((task) => ({ value: task.id, label: task.title }))}
                error={errors.task_id?.message}
                {...register('task_id')}
              />
            </div>
            <Textarea
              label="Work completed"
              required
              rows={5}
              error={errors.work_completed?.message}
              {...register('work_completed', {
                validate: (value) => value.trim().length > 0 || 'Describe the work you completed.',
              })}
            />
            <Textarea label="Work remaining" rows={3} error={errors.work_remaining?.message} {...register('work_remaining')} />
            <Textarea label="Issues or blockers" rows={3} error={errors.issues?.message} {...register('issues')} />
            <Textarea label="Notes" rows={3} error={errors.notes?.message} {...register('notes')} />
            <div className="form-actions">
              <Button variant="outline" onClick={() => void navigate('/eod')} disabled={submit.isPending}>
                Cancel
              </Button>
              <Button type="submit" loading={submit.isPending}>
                Submit report
              </Button>
            </div>
          </div>
        </Section>
      </form>
    </section>
  )
}
