import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select, Textarea } from '@/components/ui/fields'
import { applyApiError } from '@/lib/forms'
import { PROJECT_STATUS, optionsOf } from '@/lib/labels'
import { useCreateProject, useUpdateProject, type Project, type ProjectPatch } from './queries'

interface ProjectFormValues {
  name: string
  description: string
  status: Project['status']
  start_date: string
  expected_end_date: string
  actual_end_date: string
}

const FIELDS = ['name', 'description', 'status', 'start_date', 'expected_end_date', 'actual_end_date'] as const

/** Create a project, or edit one the caller may modify. Mounted only while open. */
export function ProjectFormDialog({
  open,
  onClose,
  project,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  project?: Project | undefined
  onSaved?: (project: Project) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title={project ? 'Edit project' : 'New project'}>
      <ProjectForm onClose={onClose} project={project} onSaved={onSaved} />
    </Dialog>
  )
}

function ProjectForm({
  onClose,
  project,
  onSaved,
}: {
  onClose: () => void
  project: Project | undefined
  onSaved: ((project: Project) => void) | undefined
}) {
  const toast = useToast()
  const create = useCreateProject()
  const update = useUpdateProject()
  const [formError, setFormError] = useState<string | null>(null)
  const pending = create.isPending || update.isPending
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    defaultValues: {
      name: project?.name ?? '',
      description: project?.description ?? '',
      status: project?.status ?? 'not_started',
      start_date: project?.start_date ?? '',
      expected_end_date: project?.expected_end_date ?? '',
      actual_end_date: project?.actual_end_date ?? '',
    },
  })

  const done = (saved: Project, message: string) => {
    toast.success(message)
    onSaved?.(saved)
    onClose()
  }
  const fail = (error: unknown) => setFormError(applyApiError(error, setError, FIELDS))

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    if (project) {
      const patch: ProjectPatch = {}
      if (values.name.trim() !== project.name) patch.name = values.name.trim()
      if (values.description.trim() && values.description.trim() !== (project.description ?? '')) patch.description = values.description.trim()
      if (values.status !== project.status) patch.status = values.status
      if (values.start_date && values.start_date !== project.start_date) patch.start_date = values.start_date
      if (values.expected_end_date && values.expected_end_date !== project.expected_end_date) patch.expected_end_date = values.expected_end_date
      if (values.actual_end_date && values.actual_end_date !== project.actual_end_date) patch.actual_end_date = values.actual_end_date
      if (Object.keys(patch).length === 0) {
        onClose()
        return
      }
      update.mutate({ id: project.id, patch }, { onSuccess: (saved) => done(saved, 'Project updated.'), onError: fail })
      return
    }
    create.mutate(
      {
        name: values.name.trim(),
        description: values.description.trim() || null,
        status: values.status,
        start_date: values.start_date || null,
        expected_end_date: values.expected_end_date || null,
      },
      { onSuccess: (saved) => done(saved, 'Project created.'), onError: fail },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Input
        label="Project name"
        required
        error={errors.name?.message}
        {...register('name', { validate: (value) => value.trim().length > 0 || 'Give the project a name.' })}
      />
      <Textarea
        label="Description"
        rows={3}
        hint={project ? 'A description can be changed but not cleared.' : undefined}
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="form-grid two">
        <Select label="Status" options={optionsOf(PROJECT_STATUS)} error={errors.status?.message} {...register('status')} />
        <span />
        <Input label="Start date" type="date" error={errors.start_date?.message} {...register('start_date')} />
        <Input
          label="Expected end"
          type="date"
          error={errors.expected_end_date?.message}
          {...register('expected_end_date', {
            validate: (value, form) => !value || !form.start_date || value >= form.start_date || 'The end cannot be before the start.',
          })}
        />
        {project && <Input label="Actual end" type="date" error={errors.actual_end_date?.message} {...register('actual_end_date')} />}
      </div>
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {project ? 'Save changes' : 'Create project'}
        </Button>
      </div>
    </form>
  )
}
