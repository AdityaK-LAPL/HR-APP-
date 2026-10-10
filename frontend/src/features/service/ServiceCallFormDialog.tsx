import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select, Textarea } from '@/components/ui/fields'
import { useAuth } from '@/features/auth/authContext'
import { CustomerPicker } from '@/features/customers/CustomerPicker'
import { useCreateServiceCall, useCustomerMachines } from '@/features/customers/queries'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { useManagerOptions } from '@/features/team/queries'
import { companyLocalToIso, isoToCompanyLocal } from '@/lib/dates'
import { applyApiError } from '@/lib/forms'
import { CONTACT_METHOD, PRIORITY, SERVICE_TYPE, optionsOf } from '@/lib/labels'
import { useCustomerContacts, type Machine } from './queries'

interface Values {
  service_call_code: string
  machine_id: string
  reported_by: string
  contacted_at: string
  contact_method: keyof typeof CONTACT_METHOD
  service_type: keyof typeof SERVICE_TYPE
  priority: keyof typeof PRIORITY
  issue_reported: string
  responsible: string
}

const FIELDS = ['service_call_code', 'machine_id', 'reported_by', 'contacted_at', 'contact_method', 'service_type', 'priority', 'issue_reported', 'responsible'] as const

/**
 * Log a customer's call: customer -> machine -> who reported it -> what is wrong. The call starts as
 * "New"; assigning someone and recording visits happen on the call itself. `customer` / `machine`
 * prefill the form when it is opened from their pages. Mounted only while open.
 */
export function ServiceCallFormDialog({
  open,
  onClose,
  customer,
  machine,
}: {
  open: boolean
  onClose: () => void
  customer?: { id: string; name: string } | undefined
  machine?: Pick<Machine, 'id' | 'machine_code'> | undefined
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Log a service call">
      <CallForm onClose={onClose} customer={customer} machine={machine} />
    </Dialog>
  )
}

function CallForm({ onClose, customer, machine }: { onClose: () => void; customer: { id: string; name: string } | undefined; machine: Pick<Machine, 'id' | 'machine_code'> | undefined }) {
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const today = useCompanyToday()
  const create = useCreateServiceCall()
  const managers = useManagerOptions()
  const [customerId, setCustomerId] = useState(customer?.id ?? '')
  const [customerName, setCustomerName] = useState(customer?.name ?? '')
  const [customerError, setCustomerError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)
  const machines = useCustomerMachines(customerId || undefined)
  const contacts = useCustomerContacts(customerId || undefined)
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    defaultValues: {
      service_call_code: `SC-${today.replace(/-/g, '')}-${isoToCompanyLocal(new Date().toISOString()).slice(11, 16).replace(':', '')}`,
      machine_id: machine?.id ?? '',
      reported_by: '',
      contacted_at: isoToCompanyLocal(new Date().toISOString()),
      contact_method: 'phone',
      service_type: 'field_visit',
      priority: 'medium',
      issue_reported: '',
      responsible: '',
    },
  })

  const submit = handleSubmit((values) => {
    setFormError(null)
    if (!customerId) return // the missing customer was already flagged by `onSubmit`
    create.mutate(
      {
        service_call_code: values.service_call_code.trim(),
        customer_id: customerId,
        machine_id: values.machine_id,
        reported_by_contact_id: values.reported_by || null,
        contacted_at: companyLocalToIso(values.contacted_at),
        contact_method: values.contact_method,
        issue_reported: values.issue_reported.trim(),
        priority: values.priority,
        service_type: values.service_type,
        responsible_manager_id: values.responsible || null,
      },
      {
        onSuccess: (call) => {
          toast.success(`Service call ${call.service_call_code} logged.`)
          onClose()
          void navigate(`/service/${call.id}`)
        },
        onError: (error) => setFormError(applyApiError(error, setError, FIELDS)),
      },
    )
  })
  // The customer is chosen outside the form fields, so check it before the field rules run.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!customerId) setCustomerError('Choose the customer who called.')
    void submit(event)
  }

  const machineOptions = (machines.data ?? []).map((m) => ({ value: m.id, label: `${m.machine_code}${m.model_name ? ` · ${m.model_name}` : ''}${m.serial_number ? ` · ${m.serial_number}` : ''}` }))
  // A machine passed in from its own page is selectable immediately, before the customer's list loads.
  if (machine && customerId && !machineOptions.some((option) => option.value === machine.id)) machineOptions.unshift({ value: machine.id, label: machine.machine_code })
  const contactOptions = (contacts.data ?? []).map((c) => ({ value: c.id, label: `${c.name}${c.designation ? ` · ${c.designation}` : ''}${c.is_primary ? ' (primary)' : ''}` }))

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      {formError && <Alert tone="error">{formError}</Alert>}
      {customer ? (
        <p>
          Customer: <strong>{customer.name}</strong>
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
            setValue('machine_id', '')
            setValue('reported_by', '')
          }}
        />
      )}
      <div className="form-grid two">
        <Select
          label="Machine"
          required
          disabled={!customerId}
          placeholder={!customerId ? 'Choose a customer first' : machines.isPending ? 'Loading machines…' : machineOptions.length ? 'Choose the machine' : 'This customer has no machines yet'}
          options={machineOptions}
          hint={customerId && !machines.isPending && machineOptions.length === 0 ? 'Add the machine from the customer\'s page first.' : undefined}
          error={errors.machine_id?.message}
          {...register('machine_id', { required: 'Choose the machine that has the problem.' })}
        />
        <Select
          label="Reported by"
          disabled={!customerId}
          placeholder="Not recorded"
          options={contactOptions}
          error={errors.reported_by?.message}
          {...register('reported_by')}
        />
        <Input
          label="Call number"
          required
          hint="Your own reference. It must be unique; change it if you use another scheme."
          error={errors.service_call_code?.message}
          {...register('service_call_code', { validate: (value) => value.trim().length > 0 || 'Enter a call number.' })}
        />
        <Input label="Reported at" type="datetime-local" required error={errors.contacted_at?.message} {...register('contacted_at', { required: 'Enter when the customer contacted you.' })} />
        <Select label="How they contacted us" options={optionsOf(CONTACT_METHOD)} error={errors.contact_method?.message} {...register('contact_method')} />
        <Select label="Type of service" options={optionsOf(SERVICE_TYPE)} error={errors.service_type?.message} {...register('service_type')} />
        <Select label="Priority" options={optionsOf(PRIORITY)} error={errors.priority?.message} {...register('priority')} />
        <Select
          label="Responsible manager"
          options={managers.options}
          placeholder={user ? 'You' : ''}
          hint="Who is accountable for this call. Defaults to you."
          error={errors.responsible?.message}
          {...register('responsible')}
        />
      </div>
      <Textarea
        label="Problem reported"
        required
        rows={3}
        error={errors.issue_reported?.message}
        {...register('issue_reported', { validate: (value) => value.trim().length > 0 || 'Describe the problem the customer reported.' })}
      />
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          Log service call
        </Button>
      </div>
    </form>
  )
}
