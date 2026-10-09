import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string | undefined
  hint?: string
  icon?: ReactNode
  /** Control rendered inside the right edge (e.g. a show/hide password button). */
  action?: ReactNode
}

/** Label + input + hint/error, wired with htmlFor / aria-invalid / aria-describedby. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, icon, action, className = '', id, required, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const messageId = `${inputId}-message`
  const message = error ?? hint

  return (
    <div className="field">
      <label htmlFor={inputId} className="field-label">
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="field-control">
        {icon && <span className="field-icon">{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={['input', icon && 'has-icon', action && 'has-action', className]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />
        {action && <span className="field-action">{action}</span>}
      </div>
      {message && (
        <span id={messageId} className={error ? 'field-error' : 'field-hint'} role={error ? 'alert' : undefined}>
          {message}
        </span>
      )}
    </div>
  )
})
