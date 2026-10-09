import { MapPin, X } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select, Textarea } from '@/components/ui/fields'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { companyLocalToIso, isoToCompanyLocal } from '@/lib/dates'
import { applyApiError } from '@/lib/forms'
import { describeLocationFailure, getCurrentLocation, type Coordinates } from '@/lib/geolocation'
import { VISIT_TYPE, optionsOf } from '@/lib/labels'
import { useCreateVisit, useUpdateVisit, type ServiceCall, type Visit } from './queries'

interface VisitForm {
  visit_type: Visit['visit_type']
  visit_date: string
  arrival: string
  departure: string
  work_performed: string
  problem_found: string
  parts_used: string
  action_taken: string
  result: string
  customer_signoff: string
}

const FIELDS = [
  'visit_type', 'visit_date', 'arrival', 'departure', 'work_performed', 'problem_found',
  'parts_used', 'action_taken', 'result', 'customer_signoff',
] as const

function defaults(call: ServiceCall, today: string, visit: Visit | null): VisitForm {
  return {
    visit_type: visit?.visit_type ?? (call.service_type === 'field_visit' ? 'field_visit' : 'online_support'),
    visit_date: visit?.visit_date ?? today,
    arrival: isoToCompanyLocal(visit?.arrival_time),
    departure: isoToCompanyLocal(visit?.departure_time),
    work_performed: visit?.work_performed ?? '',
    problem_found: visit?.problem_found ?? '',
    parts_used: visit?.parts_used ?? '',
    action_taken: visit?.action_taken ?? '',
    result: visit?.result ?? '',
    customer_signoff: visit?.customer_signoff ?? '',
  }
}

/** Record (or correct) a visit / online support session on a call you are assigned to. */
export function VisitDialog({
  call,
  visit,
  open,
  onClose,
}: {
  call: ServiceCall
  visit: Visit | null
  open: boolean
  onClose: () => void
}) {
  const create = useCreateVisit(call.id)
  const update = useUpdateVisit(call.id)
  const pending = create.isPending || update.isPending
  return (
    <Dialog open={open} onClose={onClose} title={visit ? 'Edit visit' : 'Record a visit'} dismissible={!pending}>
      {/* Mounted only while open, so every opening starts from a fresh form. */}
      <VisitFormBody call={call} visit={visit} create={create} update={update} onClose={onClose} />
    </Dialog>
  )
}

function VisitFormBody({
  call,
  visit,
  create,
  update,
  onClose,
}: {
  call: ServiceCall
  visit: Visit | null
  create: ReturnType<typeof useCreateVisit>
  update: ReturnType<typeof useUpdateVisit>
  onClose: () => void
}) {
  const toast = useToast()
  const today = useCompanyToday()
  const pending = create.isPending || update.isPending
  const [formError, setFormError] = useState<string | null>(null)
  const [coords, setCoords] = useState<Coordinates | null>(
    visit && visit.latitude !== null && visit.longitude !== null
      ? { latitude: visit.latitude, longitude: visit.longitude }
      : null,
  )
  const [locating, setLocating] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<VisitForm>({ defaultValues: defaults(call, today, visit) })

  const findLocation = async () => {
    setLocating(true)
    const result = await getCurrentLocation()
    setLocating(false)
    if (result.ok) setCoords(result.coordinates)
    else toast.info(describeLocationFailure(result.reason), 'Location not recorded')
  }

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    const common = {
      visit_date: values.visit_date || null,
      arrival_time: values.arrival ? companyLocalToIso(values.arrival) : null,
      departure_time: values.departure ? companyLocalToIso(values.departure) : null,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      work_performed: values.work_performed.trim() || null,
      problem_found: values.problem_found.trim() || null,
      parts_used: values.parts_used.trim() || null,
      action_taken: values.action_taken.trim() || null,
      result: values.result.trim() || null,
      customer_signoff: values.customer_signoff.trim() || null,
    }
    const handlers = {
      onSuccess: () => {
        toast.success(visit ? 'Visit updated.' : 'Visit recorded.')
        onClose()
      },
      onError: (error: unknown) =>
        setFormError(
          applyApiError(error, setError, FIELDS),
        ),
    }
    if (visit) update.mutate({ id: visit.id, input: common }, handlers)
    else create.mutate({ visit_type: values.visit_type, ...common }, handlers)
  })

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="stack">
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className="form-grid two">
          <Select
            label="Type"
            required
            disabled={visit !== null}
            options={optionsOf(VISIT_TYPE)}
            {...register('visit_type')}
          />
          <Input label="Date" type="date" required error={errors.visit_date?.message} {...register('visit_date', { required: 'Choose the visit date.' })} />
          <Input label="Arrived" type="datetime-local" {...register('arrival')} />
          <Input
            label="Left"
            type="datetime-local"
            error={errors.departure?.message}
            {...register('departure', {
              validate: (value, form) => !value || !form.arrival || value >= form.arrival || 'You cannot leave before you arrive.',
            })}
          />
        </div>
        <Textarea
          label="Work performed"
          required
          rows={3}
          error={errors.work_performed?.message}
          {...register('work_performed', { validate: (v) => v.trim().length > 0 || 'Describe the work you did.' })}
        />
        <Textarea label="Problem found" rows={2} {...register('problem_found')} />
        <Textarea label="Action taken" rows={2} {...register('action_taken')} />
        <Textarea label="Parts used" rows={2} {...register('parts_used')} />
        <Textarea label="Result" rows={2} {...register('result')} />
        <Input label="Customer sign-off (name)" {...register('customer_signoff')} />

        <div className="meta-line">
          {coords ? (
            <>
              <MapPin size={14} aria-hidden="true" /> Location recorded ({coords.latitude}, {coords.longitude})
              <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setCoords(null)}>
                Remove
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" icon={<MapPin size={14} />} loading={locating} onClick={() => void findLocation()}>
              Use my location
            </Button>
          )}
        </div>

        <div className="form-actions">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {visit ? 'Save changes' : 'Save visit'}
          </Button>
        </div>
      </form>
    </>
  )
}
