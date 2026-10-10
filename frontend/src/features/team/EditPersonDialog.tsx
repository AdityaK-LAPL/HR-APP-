import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { applyApiError } from '@/lib/forms'
import { useUpdatePerson, type Person } from './queries'

interface Values {
  name: string
  designation: string
}

/** Managers may change a team member's name and designation (nothing else: role, status and reporting line are the Owner's). */
export function EditPersonDialog({ person, open, onClose }: { person: Person; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Edit profile">
      <EditForm person={person} onClose={onClose} />
    </Dialog>
  )
}

function EditForm({ person, onClose }: { person: Person; onClose: () => void }) {
  const toast = useToast()
  const update = useUpdatePerson()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ defaultValues: { name: person.name, designation: person.designation ?? '' } })

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    const input: { name?: string; designation?: string } = {}
    if (values.name.trim() !== person.name) input.name = values.name.trim()
    if (values.designation.trim() && values.designation.trim() !== (person.designation ?? '')) input.designation = values.designation.trim()
    if (Object.keys(input).length === 0) {
      onClose()
      return
    }
    update.mutate(
      { id: person.id, input },
      {
        onSuccess: () => {
          toast.success('Profile updated.')
          onClose()
        },
        onError: (error) => setFormError(applyApiError(error, setError, ['name', 'designation'])),
      },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Input
        label="Name"
        required
        error={errors.name?.message}
        {...register('name', { validate: (value) => value.trim().length > 0 || 'Enter a name.' })}
      />
      <Input
        label="Designation"
        hint={person.designation ? 'A designation can be changed but not cleared.' : undefined}
        error={errors.designation?.message}
        {...register('designation')}
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
