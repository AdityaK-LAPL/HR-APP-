import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { LogIn, UserRound } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { applyApiError } from '@/lib/forms'
import { useAuth } from './authContext'

interface LoginForm {
  employee_code: string
  password: string
}

export function LoginPage() {
  const { login, notice, clearNotice } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ defaultValues: { employee_code: '', password: '' } })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    clearNotice()
    try {
      await login({ employee_code: values.employee_code.trim(), password: values.password })
      // PublicOnly / RequireAuth route the user on (to the app, or to change-password).
    } catch (error) {
      setFormError(applyApiError(error, setError, ['employee_code', 'password']))
    }
  })

  return (
    <div className="auth-screen">
      <div className="auth-glow" aria-hidden="true" />
      <main className="auth-card">
        <div className="auth-brand">
          <img src="/pwa-icon.svg" alt="" />
          <h1 style={{ fontSize: '1.45rem' }}>Welcome to OpsFlow</h1>
          <p style={{ fontSize: 13.5 }}>Sign in with your company Employee ID</p>
        </div>

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          {notice && <Alert tone="info">{notice}</Alert>}
          {formError && <Alert tone="error">{formError}</Alert>}

          <Input
            label="Employee ID"
            icon={<UserRound size={18} />}
            autoComplete="username"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            required
            error={errors.employee_code?.message}
            {...register('employee_code', { required: 'Enter your Employee ID.' })}
          />
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            required
            error={errors.password?.message}
            {...register('password', { required: 'Enter your password.' })}
          />

          <Button type="submit" size="lg" block loading={isSubmitting} icon={<LogIn size={18} />}>
            Sign in
          </Button>
        </form>
      </main>
    </div>
  )
}
