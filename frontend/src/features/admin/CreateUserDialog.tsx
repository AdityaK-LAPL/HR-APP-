import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Select } from '@/components/ui/fields'
import { personLabel, useVisibleUsers } from '@/features/team/queries'
import { applyApiError } from '@/lib/forms'
import { useCreateUser } from './queries'

const MIN_LENGTH = 8 // mirrors the server's minimum; the server is the authority

interface Values {
  employee_code: string
  name: string
  designation: string
  role: 'manager' | 'employee'
  manager_id: string
  initial_password: string
}

const FIELDS = ['employee_code', 'name', 'designation', 'role', 'manager_id', 'initial_password'] as const

/** Create a person. They must choose their own password at first sign-in (the server forces it). */
export function CreateUserDialog({ open, onClose, defaultManager }: { open: boolean; onClose: () => void; defaultManager?: string | undefined }) {
  return (
    <Dialog open={open} onClose={onClose} title="Add a person">
      <CreateForm onClose={onClose} defaultManager={defaultManager} />
    </Dialog>
  )
}

function CreateForm({ onClose, defaultManager }: { onClose: () => void; defaultManager: string | undefined }) {
  const toast = useToast()
  const navigate = useNavigate()
  const create = useCreateUser()
  const managers = useVisibleUsers({ is_active: true, page: 1, page_size: 100 })
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<Values>({
    defaultValues: { employee_code: '', name: '', designation: '', role: 'employee', manager_id: defaultManager ?? '', initial_password: '' },
  })
  const role = useWatch({ control, name: 'role' })
  // The same rule the server applies when moving someone: a manager must be a manager (or the Owner).
  const managerOptions = (managers.data?.items ?? [])
    .filter((person) => person.role === 'manager' || person.role === 'owner')
    .map((person) => ({ value: person.id, label: personLabel(person) }))

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    create.mutate(
      {
        employee_code: values.employee_code.trim(),
        name: values.name.trim(),
        designation: values.designation.trim() || null,
        role: values.role,
        manager_id: values.manager_id || null,
        initial_password: values.initial_password,
      },
      {
        onSuccess: (person) => {
          toast.success(`${person.name} was added. They must choose a new password when they first sign in.`)
          onClose()
          void navigate(`/users/${person.id}`)
        },
        onError: (error) => setFormError(applyApiError(error, setError, FIELDS)),
      },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="form-grid two">
        <Input
          label="Employee ID"
          required
          hint="Used to sign in. It cannot be changed later."
          error={errors.employee_code?.message}
          {...register('employee_code', { validate: (value) => value.trim().length > 0 || 'Enter an employee ID.' })}
        />
        <Input
          label="Name"
          required
          error={errors.name?.message}
          {...register('name', { validate: (value) => value.trim().length > 0 || 'Enter a name.' })}
        />
        <Input label="Designation" error={errors.designation?.message} {...register('designation')} />
        <Select
          label="Role"
          options={[
            { value: 'employee', label: 'Employee' },
            { value: 'manager', label: 'Manager' },
          ]}
          hint={role === 'manager' ? 'Managers see their own team and projects, and can be given more by Permissions.' : undefined}
          error={errors.role?.message}
          {...register('role')}
        />
      </div>
      <Select
        label="Reports to"
        placeholder="No manager"
        options={managerOptions}
        hint="Choose who this person reports to. You can change it later."
        error={errors.manager_id?.message}
        {...register('manager_id')}
      />
      <PasswordInput
        label="Temporary password"
        required
        autoComplete="new-password"
        hint={`At least ${MIN_LENGTH} characters. Give it to them in person or by phone; they must change it at first sign-in.`}
        error={errors.initial_password?.message}
        {...register('initial_password', {
          required: 'Enter a temporary password.',
          minLength: { value: MIN_LENGTH, message: `Use at least ${MIN_LENGTH} characters.` },
        })}
      />
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          Add person
        </Button>
      </div>
    </form>
  )
}
