import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from '@/api/errors'

/**
 * Put a failed submit onto the form: server field errors (`error.details`) land on their fields;
 * anything else is returned as one form-level message for an <Alert>.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.'

  let placed = 0
  for (const [field, message] of Object.entries(error.fieldErrors)) {
    if ((fields as readonly string[]).includes(field)) {
      setError(field as Path<T>, { type: 'server', message })
      placed += 1
    }
  }
  if (placed > 0 && placed === Object.keys(error.fieldErrors).length) return null

  switch (error.code) {
    case 'rate_limit_exceeded':
      return 'Too many attempts. Please wait a minute and try again.'
    case 'network_error':
      return error.message
    default:
      return error.message
  }
}
