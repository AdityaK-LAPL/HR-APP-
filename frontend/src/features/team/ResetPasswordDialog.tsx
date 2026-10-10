import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { applyApiError } from '@/lib/forms'
import { useResetPassword, type Person } from './queries'

const MIN_LENGTH = 8 // mirrors the server's minimum; the server is the authority

interface Values {
  temporary_password: string
}

/** Set a temporary password for a team member who is locked out (there is no self-service recovery). */
export function ResetPasswordDialog({ person, open, onClose }: { person: Person; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={`Reset password for ${person.name}`}>
      <ResetForm person={person} onClose={onClose} />
    </Dialog>
  )
}

function ResetForm({ person, onClose }: { person: Person; onClose: () => void }) {
  const toast = useToast()
  const reset = useResetPassword()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ defaultValues: { temporary_password: '' } })

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    reset.mutate(
      { id: person.id, temporary_password: values.temporary_password },
      {
        onSuccess: () => {
          toast.success(`Temporary password set for ${person.name}.`)
          onClose()
        },
        onError: (error) => setFormError(applyApiError(error, setError, ['temporary_password'])),
      },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Alert tone="info">
        {person.name} will be signed out everywhere and must choose a new password the next time they sign in. Give them the
        temporary password in person or by phone.
      </Alert>
      <PasswordInput
        label="Temporary password"
        required
        autoComplete="new-password"
        hint={`At least ${MIN_LENGTH} characters.`}
        error={errors.temporary_password?.message}
        {...register('temporary_password', {
          required: 'Enter a temporary password.',
          minLength: { value: MIN_LENGTH, message: `Use at least ${MIN_LENGTH} characters.` },
        })}
      />
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={reset.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={reset.isPending}>
          Reset password
        </Button>
      </div>
    </form>
  )
}
