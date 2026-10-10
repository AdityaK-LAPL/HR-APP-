import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select, Textarea } from '@/components/ui/fields'
import type { Machine } from '@/features/service/queries'
import { applyApiError } from '@/lib/forms'
import { MACHINE_STATUS, optionsOf } from '@/lib/labels'
import { CustomerPicker } from './CustomerPicker'
import { useCreateMachine, useUpdateMachine, type MachinePatch } from './queries'

interface Values {
  machine_code: string
  model_name: string
  serial_number: string
  installation_date: string
  location: string
  purchase_info: string
  warranty_info: string
  status: Machine['status']
}

const FIELDS = ['machine_code', 'model_name', 'serial_number', 'installation_date', 'location', 'purchase_info', 'warranty_info', 'status'] as const

/**
 * Add a machine to a customer (`customer` fixes the customer; otherwise it is picked), or edit one.
 * A machine's code and customer cannot change afterwards. Mounted only while open.
 */
export function MachineFormDialog({
  open,
  onClose,
  machine,
  customer,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  machine?: Machine | undefined
  customer?: { id: string; name: string } | undefined
  onSaved?: (machine: Machine) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title={machine ? 'Edit machine' : 'Add a machine'}>
      <MachineForm onClose={onClose} machine={machine} customer={customer} onSaved={onSaved} />
    </Dialog>
  )
}

function MachineForm({ onClose, machine, customer, onSaved }: { onClose: () => void; machine: Machine | undefined; customer: { id: string; name: string } | undefined; onSaved: ((machine: Machine) => void) | undefined }) {
  const toast = useToast()
  const create = useCreateMachine()
  const update = useUpdateMachine()
  const [formError, setFormError] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState(customer?.id ?? '')
  const [customerName, setCustomerName] = useState(customer?.name ?? '')
  const [customerError, setCustomerError] = useState<string | undefined>()
  const pending = create.isPending || update.isPending
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    defaultValues: {
      machine_code: machine?.machine_code ?? '',
      model_name: machine?.model_name ?? '',
      serial_number: machine?.serial_number ?? '',
      installation_date: machine?.installation_date ?? '',
      location: machine?.location ?? '',
      purchase_info: machine?.purchase_info ?? '',
      warranty_info: machine?.warranty_info ?? '',
      status: machine?.status ?? 'active',
    },
  })
  const fail = (error: unknown) => setFormError(applyApiError(error, setError, FIELDS))
  const done = (saved: Machine, message: string) => {
    toast.success(message)
    onSaved?.(saved)
    onClose()
  }

  const submit = handleSubmit((values) => {
    setFormError(null)
    if (machine) {
      const patch: MachinePatch = {}
      if (values.model_name.trim() && values.model_name.trim() !== (machine.model_name ?? '')) patch.model_name = values.model_name.trim()
      if (values.serial_number.trim() && values.serial_number.trim() !== (machine.serial_number ?? '')) patch.serial_number = values.serial_number.trim()
      if (values.installation_date && values.installation_date !== machine.installation_date) patch.installation_date = values.installation_date
      if (values.location.trim() && values.location.trim() !== (machine.location ?? '')) patch.location = values.location.trim()
      if (values.purchase_info.trim() && values.purchase_info.trim() !== (machine.purchase_info ?? '')) patch.purchase_info = values.purchase_info.trim()
      if (values.warranty_info.trim() && values.warranty_info.trim() !== (machine.warranty_info ?? '')) patch.warranty_info = values.warranty_info.trim()
      if (values.status !== machine.status) patch.status = values.status
      if (Object.keys(patch).length === 0) {
        onClose()
        return
      }
      update.mutate({ id: machine.id, patch }, { onSuccess: (saved) => done(saved, 'Machine updated.'), onError: fail })
      return
    }
    if (!customerId) return // the missing customer was already flagged by `onSubmit`
    create.mutate(
      {
        customer_id: customerId,
        machine_code: values.machine_code.trim(),
        model_name: values.model_name.trim() || null,
        serial_number: values.serial_number.trim() || null,
        installation_date: values.installation_date || null,
        location: values.location.trim() || null,
        purchase_info: values.purchase_info.trim() || null,
        warranty_info: values.warranty_info.trim() || null,
      },
      { onSuccess: (saved) => done(saved, 'Machine added.'), onError: fail },
    )
  })
  // The customer is chosen outside the form fields, so check it before the field rules run.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!machine && !customerId) setCustomerError('Choose the customer this machine belongs to.')
    void submit(event)
  }

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      {formError && <Alert tone="error">{formError}</Alert>}
      {!machine &&
        (customer ? (
          <p>
            For customer <strong>{customer.name}</strong>
          </p>
        ) : (
          <CustomerPicker
            value={customerId}
            selectedName={customerName}
            error={customerError}
            onChange={(id, name) => {
              setCustomerId(id)
              setCustomerName(name)
              setCustomerError(undefined)
            }}
          />
        ))}
      <div className="form-grid two">
        <Input
          label="Machine code"
          required={!machine}
          disabled={Boolean(machine)}
          hint={machine ? 'The code cannot be changed.' : 'Your own reference, e.g. MC-88. Must be unique.'}
          error={errors.machine_code?.message}
          {...register('machine_code', { validate: (value) => Boolean(machine) || value.trim().length > 0 || 'Enter a machine code.' })}
        />
        <Input label="Model" error={errors.model_name?.message} {...register('model_name')} />
        <Input label="Serial number" error={errors.serial_number?.message} {...register('serial_number')} />
        <Input label="Installed on" type="date" error={errors.installation_date?.message} {...register('installation_date')} />
        <Input label="Location" hint="Where the machine is, e.g. Bay 4." error={errors.location?.message} {...register('location')} />
        {machine && <Select label="Status" options={optionsOf(MACHINE_STATUS)} error={errors.status?.message} {...register('status')} />}
      </div>
      <Textarea label="Warranty" rows={2} error={errors.warranty_info?.message} {...register('warranty_info')} />
      <Textarea label="Purchase details" rows={2} error={errors.purchase_info?.message} {...register('purchase_info')} />
      {machine && <p style={{ fontSize: 13 }}>Text fields can be changed but not cleared.</p>}
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {machine ? 'Save changes' : 'Add machine'}
        </Button>
      </div>
    </form>
  )
}
