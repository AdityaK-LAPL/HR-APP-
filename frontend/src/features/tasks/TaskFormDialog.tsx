import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select, Textarea } from '@/components/ui/fields'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { useProjects } from '@/features/projects/queries'
import { useAssignableUsers } from '@/features/team/queries'
import { applyApiError } from '@/lib/forms'
import { PRIORITY, TASK_STATUS, optionsOf } from '@/lib/labels'
import { useCreateTask, useUpdateTask, type Task, type TaskPatch } from './queries'

interface TaskFormValues {
  title: string
  description: string
  assigned_to: string
  project_id: string
  priority: Task['priority']
  status: Task['status']
  task_date: string
  due_date: string
}

const FIELDS = ['title', 'description', 'assigned_to', 'project_id', 'priority', 'status', 'task_date', 'due_date'] as const

/** Create a task (no `task`) or edit one. Mounted only while open so each opening starts fresh. */
export function TaskFormDialog({
  open,
  onClose,
  task,
  defaultAssignee,
}: {
  open: boolean
  onClose: () => void
  task?: Task | undefined
  defaultAssignee?: string | undefined
}) {
  return (
    <Dialog open={open} onClose={onClose} title={task ? 'Edit task' : 'Assign a task'}>
      <TaskForm onClose={onClose} task={task} defaultAssignee={defaultAssignee} />
    </Dialog>
  )
}

function TaskForm({
  onClose,
  task,
  defaultAssignee,
}: {
  onClose: () => void
  task: Task | undefined
  defaultAssignee: string | undefined
}) {
  const toast = useToast()
  const today = useCompanyToday()
  const create = useCreateTask()
  const update = useUpdateTask()
  const assignable = useAssignableUsers()
  const projects = useProjects({ page: 1, page_size: 100 })
  const [formError, setFormError] = useState<string | null>(null)
  const pending = create.isPending || update.isPending
  const editing = Boolean(task)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TaskFormValues>({
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      assigned_to: task?.assigned_to ?? defaultAssignee ?? '',
      project_id: task?.project_id ?? '',
      priority: task?.priority ?? 'medium',
      status: task?.status ?? 'not_started',
      task_date: task?.task_date ?? today,
      due_date: task?.due_date ?? '',
    },
  })

  const fail = (error: unknown) => setFormError(applyApiError(error, setError, FIELDS))

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    if (task) {
      // Only what changed: the API cannot clear a field, and unchanged fields add history noise.
      const patch: TaskPatch = {}
      if (values.title.trim() !== task.title) patch.title = values.title.trim()
      if (values.description.trim() && values.description.trim() !== (task.description ?? '')) patch.description = values.description.trim()
      if (values.assigned_to !== task.assigned_to) patch.assigned_to = values.assigned_to
      if (values.project_id && values.project_id !== task.project_id) patch.project_id = values.project_id
      if (values.priority !== task.priority) patch.priority = values.priority
      if (values.status !== task.status) patch.status = values.status
      if (values.task_date && values.task_date !== task.task_date) patch.task_date = values.task_date
      if (values.due_date && values.due_date !== task.due_date) patch.due_date = values.due_date
      if (Object.keys(patch).length === 0) {
        onClose()
        return
      }
      update.mutate(
        { id: task.id, patch },
        {
          onSuccess: () => {
            toast.success('Task updated.')
            onClose()
          },
          onError: fail,
        },
      )
      return
    }
    create.mutate(
      {
        title: values.title.trim(),
        description: values.description.trim() || null,
        assigned_to: values.assigned_to,
        project_id: values.project_id || null,
        priority: values.priority,
        task_date: values.task_date || null,
        due_date: values.due_date || null,
      },
      {
        onSuccess: () => {
          toast.success('Task assigned.')
          onClose()
        },
        onError: fail,
      },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Input
        label="Title"
        required
        error={errors.title?.message}
        {...register('title', { validate: (value) => value.trim().length > 0 || 'Give the task a title.' })}
      />
      <Textarea
        label="Description"
        rows={3}
        hint={editing ? 'A description can be changed but not cleared.' : undefined}
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="form-grid two">
        <Select
          label="Assign to"
          required
          placeholder={assignable.isLoading ? 'Loading people…' : 'Choose a person'}
          options={assignable.options}
          error={errors.assigned_to?.message}
          {...register('assigned_to', { required: 'Choose who this task is for.' })}
        />
        <Select
          label="Project"
          placeholder="No project"
          hint={editing ? 'A project can be changed but not removed.' : undefined}
          options={(projects.data?.items ?? []).map((project) => ({ value: project.id, label: project.name }))}
          error={errors.project_id?.message}
          {...register('project_id')}
        />
        <Select label="Priority" options={optionsOf(PRIORITY)} error={errors.priority?.message} {...register('priority')} />
        {editing && <Select label="Status" options={optionsOf(TASK_STATUS)} error={errors.status?.message} {...register('status')} />}
        <Input label="Task date" type="date" error={errors.task_date?.message} {...register('task_date')} />
        <Input
          label="Due date"
          type="date"
          error={errors.due_date?.message}
          {...register('due_date', {
            validate: (value, form) => !value || !form.task_date || value >= form.task_date || 'The due date cannot be before the task date.',
          })}
        />
      </div>
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {editing ? 'Save changes' : 'Assign task'}
        </Button>
      </div>
    </form>
  )
}
