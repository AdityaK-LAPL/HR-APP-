import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface FieldChrome {
  label: string
  error?: string | undefined
  hint?: string
  required?: boolean
}

function Chrome({
  id,
  label,
  error,
  hint,
  required,
  children,
}: FieldChrome & { id: string; children: ReactNode }) {
  const message = error ?? hint
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {message && (
        <span id={`${id}-message`} className={error ? 'field-error' : 'field-hint'} role={error ? 'alert' : undefined}>
          {message}
        </span>
      )}
    </div>
  )
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldChrome {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, required, className = '', id, rows = 4, ...props },
  ref,
) {
  const generated = useId()
  const fieldId = id ?? generated
  return (
    <Chrome id={fieldId} label={label} error={error} hint={hint} required={required ?? false}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ?? hint ? `${fieldId}-message` : undefined}
        className={`input textarea ${className}`}
        {...props}
      />
    </Chrome>
  )
})

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldChrome {
  options: readonly { value: string; label: string }[]
  /** Adds a first, empty option with this text (e.g. "No project"). */
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, required, className = '', id, options, placeholder, ...props },
  ref,
) {
  const generated = useId()
  const fieldId = id ?? generated
  return (
    <Chrome id={fieldId} label={label} error={error} hint={hint} required={required ?? false}>
      <select
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ?? hint ? `${fieldId}-message` : undefined}
        className={`input select ${className}`}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Chrome>
  )
})
