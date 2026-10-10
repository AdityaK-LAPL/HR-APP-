import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import type { CustomerContact } from '@/features/service/queries'
import { applyApiError } from '@/lib/forms'
import { useAddContact, useUpdateContact, type ContactPatch } from './queries'

interface Values {
  name: string
  designation: string
  phone: string
  email: string
  is_primary: boolean
}

const FIELDS = ['name', 'designation', 'phone', 'email', 'is_primary'] as const
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Add a contact person to a customer, or correct one. Mounted only while open. */
export function ContactDialog({
  customerId,
  contact,
  open,
  onClose,
}: {
  customerId: string
  contact?: CustomerContact | undefined
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title={contact ? 'Edit contact' : 'Add a contact'}>
      <ContactForm customerId={customerId} contact={contact} onClose={onClose} />
    </Dialog>
  )
}

function ContactForm({ customerId, contact, onClose }: { customerId: string; contact: CustomerContact | undefined; onClose: () => void }) {
  const toast = useToast()
  const add = useAddContact(customerId)
  const update = useUpdateContact(customerId)
  const [formError, setFormError] = useState<string | null>(null)
  const pending = add.isPending || update.isPending
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    defaultValues: { name: contact?.name ?? '', designation: contact?.designation ?? '', phone: contact?.phone ?? '', email: contact?.email ?? '', is_primary: contact?.is_primary ?? false },
  })
  const fail = (error: unknown) => setFormError(applyApiError(error, setError, FIELDS))
  const finish = (message: string) => {
    toast.success(message)
    onClose()
  }

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    if (contact) {
      const patch: ContactPatch = {}
      if (values.name.trim() !== contact.name) patch.name = values.name.trim()
      if (values.designation.trim() && values.designation.trim() !== (contact.designation ?? '')) patch.designation = values.designation.trim()
      if (values.phone.trim() && values.phone.trim() !== (contact.phone ?? '')) patch.phone = values.phone.trim()
      if (values.email.trim() && values.email.trim() !== (contact.email ?? '')) patch.email = values.email.trim()
      if (values.is_primary !== contact.is_primary) patch.is_primary = values.is_primary
      if (Object.keys(patch).length === 0) {
        onClose()
        return
      }
      update.mutate({ id: contact.id, patch }, { onSuccess: () => finish('Contact updated.'), onError: fail })
      return
    }
    add.mutate(
      {
        name: values.name.trim(),
        designation: values.designation.trim() || null,
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        is_primary: values.is_primary,
      },
      { onSuccess: () => finish('Contact added.'), onError: fail },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="form-grid two">
        <Input label="Name" required error={errors.name?.message} {...register('name', { validate: (value) => value.trim().length > 0 || 'Enter the contact\'s name.' })} />
        <Input label="Designation" error={errors.designation?.message} {...register('designation')} />
        <Input label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
        <Input
          label="Email"
          type="email"
          error={errors.email?.message}
          {...register('email', { validate: (value) => !value.trim() || EMAIL.test(value.trim()) || 'Enter a valid email address.' })}
        />
      </div>
      <label className="check">
        <input type="checkbox" {...register('is_primary')} />
        <span>Primary contact</span>
      </label>
      {contact && <p style={{ fontSize: 13 }}>A phone, email or designation can be changed but not cleared.</p>}
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {contact ? 'Save changes' : 'Add contact'}
        </Button>
      </div>
    </form>
  )
}
