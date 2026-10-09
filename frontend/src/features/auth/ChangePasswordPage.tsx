import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { applyApiError } from '@/lib/forms'
import { useAuth } from './authContext'

const MIN_LENGTH = 8 // mirrors the server's minimum; the server is the authority

interface ChangePasswordForm {
  current_password: string
  new_password: string
  confirm: string
}

/**
 * Outside the app shell on purpose: it is the only screen a user with a temporary password can
 * reach. Success ends the session (the server revokes every session), so the user signs in again.
 */
export function ChangePasswordPage() {
  const { user, changePassword, logout } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordForm>({
    defaultValues: { current_password: '', new_password: '', confirm: '' },
  })

  const forced = user?.must_reset === true

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await changePassword({
        current_password: values.current_password,
        new_password: values.new_password,
      })
    } catch (error) {
      setFormError(applyApiError(error, setError, ['current_password', 'new_password']))
    }
  })

  return (
    <div className="auth-screen">
      <div className="auth-glow" aria-hidden="true" />
      <main className="auth-card">
        <div className="auth-brand">
          <img src="/pwa-icon.svg" alt="" />
          <h1 style={{ fontSize: '1.35rem' }}>Change your password</h1>
        </div>

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          {forced && (
            <Alert tone="warning">
              You are using a temporary password. Choose a new one to continue.
            </Alert>
          )}
          {formError && <Alert tone="error">{formError}</Alert>}

          <PasswordInput
            label="Current password"
            autoComplete="current-password"
            required
            error={errors.current_password?.message}
            {...register('current_password', { required: 'Enter your current password.' })}
          />
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            required
            hint={`At least ${MIN_LENGTH} characters.`}
            error={errors.new_password?.message}
            {...register('new_password', {
              required: 'Choose a new password.',
              minLength: { value: MIN_LENGTH, message: `Use at least ${MIN_LENGTH} characters.` },
            })}
          />
          <PasswordInput
            label="Confirm new password"
            autoComplete="new-password"
            required
            error={errors.confirm?.message}
            {...register('confirm', {
              required: 'Repeat the new password.',
              validate: (value) => value === getValues('new_password') || 'The passwords do not match.',
            })}
          />

          <Button type="submit" size="lg" block loading={isSubmitting} icon={<KeyRound size={18} />}>
            Change password
          </Button>
          {forced ? (
            <Button variant="ghost" onClick={() => void logout()}>
              Sign out
            </Button>
          ) : (
            <Link to="/" style={{ textAlign: 'center', fontSize: 14 }}>
              Cancel
            </Link>
          )}
        </form>
      </main>
    </div>
  )
}
