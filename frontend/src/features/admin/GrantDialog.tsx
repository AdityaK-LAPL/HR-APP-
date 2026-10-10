import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/fields'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { useProjects } from '@/features/projects/queries'
import { personLabel, useVisibleUsers } from '@/features/team/queries'
import { companyLocalToIso } from '@/lib/dates'
import { applyApiError } from '@/lib/forms'
import { PERMISSION_BY_KEY, PERMISSION_UI, SCOPE_TYPE_FOR, type Effect } from './permissionCatalog'
import { useCreateGrant, type Grant } from './queries'

interface GrantForm {
  grantee: string
  permission: string
  effect: Effect
  scope: string
  expires: string
}

const FIELDS = ['grantee', 'permission', 'effect', 'scope', 'expires'] as const

/**
 * Give a manager a permission, or carve one out. Only combinations the backend really evaluates are
 * offered (see permissionCatalog): the scope picker follows the permission, and "deny" appears only
 * where it changes anything. Mounted only while open.
 */
export function GrantDialog({
  open,
  onClose,
  existing,
  defaultGrantee,
}: {
  open: boolean
  onClose: () => void
  existing: readonly Grant[]
  defaultGrantee?: string | undefined
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Add a permission">
      <GrantFormBody onClose={onClose} existing={existing} defaultGrantee={defaultGrantee} />
    </Dialog>
  )
}

function GrantFormBody({
  onClose,
  existing,
  defaultGrantee,
}: {
  onClose: () => void
  existing: readonly Grant[]
  defaultGrantee: string | undefined
}) {
  const toast = useToast()
  const today = useCompanyToday()
  const create = useCreateGrant()
  const managers = useVisibleUsers({ role: 'manager', is_active: true, page: 1, page_size: 100 })
  const projects = useProjects({ page: 1, page_size: 100 })
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<GrantForm>({
    defaultValues: { grantee: defaultGrantee ?? '', permission: '', effect: 'allow', scope: '', expires: '' },
  })

  const [grantee, permission, effect, scope] = useWatch({ control, name: ['grantee', 'permission', 'effect', 'scope'] })
  const ui = PERMISSION_BY_KEY.get(permission)
  const managerOptions = (managers.data?.items ?? []).map((person) => ({ value: person.id, label: personLabel(person) }))
  const granteeName = managerOptions.find((option) => option.value === grantee)?.label.split(' · ')[0]

  const scopeOptions =
    ui?.scope === 'project'
      ? (projects.data?.items ?? []).map((project) => ({ value: project.id, label: project.name }))
      : managerOptions.filter((option) => option.value !== grantee)

  const duplicate = ui
    ? existing.some(
        (grant) =>
          grant.grantee_user_id === grantee &&
          grant.permission_key === permission &&
          grant.effect === effect &&
          (grant.scope_id ?? '') === (ui.scope === 'global' ? '' : scope),
      )
    : false
  const opposite = ui
    ? existing.some(
        (grant) =>
          grant.grantee_user_id === grantee &&
          grant.permission_key === permission &&
          grant.effect !== effect &&
          (grant.scope_id ?? '') === (ui.scope === 'global' ? '' : scope),
      )
    : false

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    const chosen = PERMISSION_BY_KEY.get(values.permission)
    if (!chosen) return
    if (duplicate) {
      setError('permission', { type: 'validate', message: 'This permission is already in place for that manager.' })
      return
    }
    create.mutate(
      {
        grantee_user_id: values.grantee,
        permission_key: values.permission,
        scope_type: SCOPE_TYPE_FOR[chosen.scope],
        scope_id: chosen.scope === 'global' ? null : values.scope,
        effect: chosen.effects.includes(values.effect) ? values.effect : 'allow',
        expires_at: values.expires ? companyLocalToIso(`${values.expires}T23:59`) : null,
      },
      {
        onSuccess: () => {
          toast.success(values.effect === 'deny' ? 'Restriction added.' : 'Permission added.')
          onClose()
        },
        onError: (error) => setFormError(applyApiError(error, setError, FIELDS)),
      },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Select
        label="Manager"
        required
        placeholder={managers.isPending ? 'Loading managers…' : 'Choose a manager'}
        options={managerOptions}
        error={errors.grantee?.message}
        {...register('grantee', { required: 'Choose the manager this applies to.', onChange: () => setValue('scope', '') })}
      />
      <Select
        label="Permission"
        required
        placeholder="Choose a permission"
        options={PERMISSION_UI.map((entry) => ({ value: entry.key, label: `${entry.group}: ${entry.label}` }))}
        hint={ui?.help}
        error={errors.permission?.message}
        {...register('permission', {
          required: 'Choose a permission.',
          onChange: (event: { target: { value: string } }) => {
            setValue('scope', '')
            const next = PERMISSION_BY_KEY.get(event.target.value)
            if (next && !next.effects.includes('deny')) setValue('effect', 'allow')
          },
        })}
      />
      {ui && ui.effects.length > 1 && (
        <Select
          label="Effect"
          options={[
            { value: 'allow', label: 'Allow' },
            { value: 'deny', label: 'Deny (a restriction that wins over anything else)' },
          ]}
          {...register('effect')}
        />
      )}
      {ui && ui.scope !== 'global' && (
        <Select
          label={ui.scopeLabel}
          required
          placeholder={ui.scope === 'project' ? 'Choose a project' : 'Choose a manager'}
          options={scopeOptions}
          error={errors.scope?.message}
          {...register('scope', { required: ui.scope === 'project' ? 'Choose the project.' : 'Choose the manager.' })}
        />
      )}
      <Input
        label="Until"
        type="date"
        min={today}
        hint="Optional. Leave empty for no end date; it ends at the close of that day."
        error={errors.expires?.message}
        {...register('expires', {
          validate: (value) => !value || value >= today || 'Choose today or a later date.',
        })}
      />
      {duplicate && <Alert tone="warning">This exact permission is already in place for that manager.</Alert>}
      {opposite && (
        <Alert tone="warning">
          The opposite setting already exists for the same manager and target. A deny always wins over an allow.
        </Alert>
      )}
      {ui && grantee && !duplicate && (ui.scope === 'global' || scope) && (
        <Alert tone="info">
          {effect === 'deny' ? 'Restrict' : 'Allow'} <strong>{granteeName}</strong>: {ui.label.toLowerCase()}
          {ui.scope !== 'global' ? ` — ${scopeOptions.find((option) => option.value === scope)?.label.split(' · ')[0] ?? ''}` : ''}
          .
        </Alert>
      )}
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant={effect === 'deny' ? 'danger' : 'primary'} loading={create.isPending}>
          {effect === 'deny' ? 'Add restriction' : 'Add permission'}
        </Button>
      </div>
    </form>
  )
}
