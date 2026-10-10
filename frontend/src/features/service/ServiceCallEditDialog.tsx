import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Select, Textarea } from '@/components/ui/fields'
import { useAuth } from '@/features/auth/authContext'
import { useUpdateServiceCall, type CallPatch } from '@/features/customers/queries'
import { useManagerOptions } from '@/features/team/queries'
import { applyApiError } from '@/lib/forms'
import { PRIORITY, SERVICE_STATUS, optionsOf } from '@/lib/labels'
import type { ServiceCall } from './queries'

interface Values {
  issue_reported: string
  priority: ServiceCall['priority']
  status: ServiceCall['status']
  resolution: string
  responsible: string
}

const FIELDS = ['issue_reported', 'priority', 'status', 'resolution', 'responsible'] as const

/** Change a call's description, priority, status, resolution (and, for the Owner, who is responsible). */
export function ServiceCallEditDialog({ call, open, onClose }: { call: ServiceCall; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={`Edit call ${call.service_call_code}`}>
      <EditForm call={call} onClose={onClose} />
    </Dialog>
  )
}

function EditForm({ call, onClose }: { call: ServiceCall; onClose: () => void }) {
  const toast = useToast()
  const { user } = useAuth()
  const update = useUpdateServiceCall()
  const managers = useManagerOptions()
  const [formError, setFormError] = useState<string | null>(null)
  const isOwner = user?.role === 'owner'
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    defaultValues: { issue_reported: call.issue_reported, priority: call.priority, status: call.status, resolution: call.resolution ?? '', responsible: call.responsible_manager_id },
  })

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    const patch: CallPatch = {}
    if (values.issue_reported.trim() !== call.issue_reported) patch.issue_reported = values.issue_reported.trim()
    if (values.priority !== call.priority) patch.priority = values.priority
    if (values.status !== call.status) patch.status = values.status
    if (values.resolution.trim() && values.resolution.trim() !== (call.resolution ?? '')) patch.resolution = values.resolution.trim()
    if (isOwner && values.responsible !== call.responsible_manager_id) patch.responsible_manager_id = values.responsible
    if (Object.keys(patch).length === 0) {
      onClose()
      return
    }
    update.mutate(
      { id: call.id, patch },
      {
        onSuccess: () => {
          toast.success('Service call updated.')
          onClose()
        },
        onError: (error) => setFormError(applyApiError(error, setError, FIELDS)),
      },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Textarea
        label="Problem reported"
        required
        rows={3}
        error={errors.issue_reported?.message}
        {...register('issue_reported', { validate: (value) => value.trim().length > 0 || 'Describe the problem.' })}
      />
      <div className="form-grid two">
        <Select label="Priority" options={optionsOf(PRIORITY)} error={errors.priority?.message} {...register('priority')} />
        <Select label="Status" options={optionsOf(SERVICE_STATUS)} error={errors.status?.message} {...register('status')} />
        {isOwner && (
          <Select
            label="Responsible manager"
            options={managers.options.some((o) => o.value === call.responsible_manager_id) ? managers.options : [...managers.options, { value: call.responsible_manager_id, label: 'Current manager' }]}
            hint="Only the Owner can hand a call to a different manager."
            error={errors.responsible?.message}
            {...register('responsible')}
          />
        )}
      </div>
      <Textarea
        label="Resolution"
        rows={3}
        hint={call.resolution ? 'A resolution can be changed but not cleared.' : 'What fixed it - fill in when you resolve the call.'}
        error={errors.resolution?.message}
        {...register('resolution')}
      />
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={update.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  )
}
