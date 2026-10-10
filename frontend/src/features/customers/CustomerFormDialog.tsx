import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/fields'
import type { Customer } from '@/features/service/queries'
import { applyApiError } from '@/lib/forms'
import { useCreateCustomer, useUpdateCustomer, type CustomerPatch } from './queries'

interface Values {
  customer_code: string
  name: string
  address: string
  notes: string
}

const FIELDS = ['customer_code', 'name', 'address', 'notes'] as const

/** Add a customer, or edit one the caller may edit (the server decides). Mounted only while open. */
export function CustomerFormDialog({
  open,
  onClose,
  customer,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  customer?: Customer | undefined
  onSaved?: (customer: Customer) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title={customer ? 'Edit customer' : 'Add a customer'}>
      <CustomerForm onClose={onClose} customer={customer} onSaved={onSaved} />
    </Dialog>
  )
}

function CustomerForm({ onClose, customer, onSaved }: { onClose: () => void; customer: Customer | undefined; onSaved: ((customer: Customer) => void) | undefined }) {
  const toast = useToast()
  const create = useCreateCustomer()
  const update = useUpdateCustomer()
  const [formError, setFormError] = useState<string | null>(null)
  const pending = create.isPending || update.isPending
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    defaultValues: { customer_code: customer?.customer_code ?? '', name: customer?.name ?? '', address: customer?.address ?? '', notes: customer?.notes ?? '' },
  })

  const done = (saved: Customer, message: string) => {
    toast.success(message)
    onSaved?.(saved)
    onClose()
  }
  const fail = (error: unknown) => setFormError(applyApiError(error, setError, FIELDS))

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    if (customer) {
      const patch: CustomerPatch = {}
      if (values.name.trim() !== customer.name) patch.name = values.name.trim()
      if (values.address.trim() && values.address.trim() !== (customer.address ?? '')) patch.address = values.address.trim()
      if (values.notes.trim() && values.notes.trim() !== (customer.notes ?? '')) patch.notes = values.notes.trim()
      if (Object.keys(patch).length === 0) {
        onClose()
        return
      }
      update.mutate({ id: customer.id, patch }, { onSuccess: (saved) => done(saved, 'Customer updated.'), onError: fail })
      return
    }
    create.mutate(
      { customer_code: values.customer_code.trim(), name: values.name.trim(), address: values.address.trim() || null, notes: values.notes.trim() || null },
      { onSuccess: (saved) => done(saved, 'Customer added.'), onError: fail },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="form-grid two">
        <Input
          label="Customer code"
          required={!customer}
          disabled={Boolean(customer)}
          hint={customer ? 'The code cannot be changed.' : 'Your own reference, e.g. CU-1042. Must be unique.'}
          error={errors.customer_code?.message}
          {...register('customer_code', { validate: (value) => Boolean(customer) || value.trim().length > 0 || 'Enter a customer code.' })}
        />
        <Input
          label="Name"
          required
          error={errors.name?.message}
          {...register('name', { validate: (value) => value.trim().length > 0 || 'Enter the customer\'s name.' })}
        />
      </div>
      <Textarea label="Address" rows={2} hint={customer?.address ? 'An address can be changed but not cleared.' : undefined} error={errors.address?.message} {...register('address')} />
      <Textarea label="Notes" rows={3} hint={customer?.notes ? 'Notes can be changed but not cleared.' : undefined} error={errors.notes?.message} {...register('notes')} />
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {customer ? 'Save changes' : 'Add customer'}
        </Button>
      </div>
    </form>
  )
}
