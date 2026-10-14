import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { WEEKDAYS } from '@/lib/calendar'
import { formatDate } from '@/lib/dates'
import { applyApiError } from '@/lib/forms'
import {
  useAddHoliday,
  useCompanySettings,
  useHolidays,
  useRemoveHoliday,
  useUpdateCompanySettings,
  type CompanySettings,
  type Holiday,
} from './queries'

/**
 * Owner only: the company's name, its weekly-off days, the time after which a punch-in counts as
 * late, and the holiday list. These drive the attendance analytics and the Excel reports (a punch
 * on a weekly off or a holiday is reported as "WOW" / "HW", and a day nobody worked is "Absent"
 * only when it is a normal working day).
 */
export function CompanySettingsPage() {
  const settings = useCompanySettings()
  return (
    <section>
      <PageHeader
        title="Company settings"
        description="The weekly off, holidays and office hours the attendance reports are built on. Only the Owner can change them."
      />
      <QueryBoundary query={settings} skeleton={<Skeleton height={160} />}>
        {(data) => <SettingsForm settings={data} />}
      </QueryBoundary>
      <HolidaysSection />
    </section>
  )
}

interface SettingsValues {
  company_name: string
  weekly_off_days: string[]
  late_after: string
}

function SettingsForm({ settings }: { settings: CompanySettings }) {
  const toast = useToast()
  const update = useUpdateCompanySettings()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
    reset,
  } = useForm<SettingsValues>({
    defaultValues: {
      company_name: settings.company_name,
      weekly_off_days: settings.weekly_off_days.map(String),
      late_after: settings.late_after.slice(0, 5),
    },
  })

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    update.mutate(
      {
        company_name: values.company_name.trim(),
        weekly_off_days: values.weekly_off_days.map(Number),
        late_after: values.late_after,
      },
      {
        onSuccess: (saved) => {
          toast.success('Company settings saved.')
          reset({
            company_name: saved.company_name,
            weekly_off_days: saved.weekly_off_days.map(String),
            late_after: saved.late_after.slice(0, 5),
          })
        },
        onError: (error) => setFormError(applyApiError(error, setError, ['company_name', 'weekly_off_days', 'late_after'])),
      },
    )
  })

  return (
    <Section title="Working week">
      <form onSubmit={onSubmit} noValidate className="stack">
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className="form-grid two">
          <Input
            label="Company name"
            required
            hint="Printed at the top of every Excel report."
            error={errors.company_name?.message}
            {...register('company_name', { required: 'Enter the company name.', maxLength: { value: 120, message: 'At most 120 characters.' } })}
          />
          <Input
            label="Late after"
            type="time"
            required
            hint="A punch-in after this time (company time) counts as late."
            error={errors.late_after?.message}
            {...register('late_after', { required: 'Choose a time.' })}
          />
        </div>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">Weekly off</legend>
          <div className="check-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
            {WEEKDAYS.map((name, index) => (
              <label key={name} className="check">
                <input type="checkbox" value={String(index)} {...register('weekly_off_days')} />
                <span>{name}</span>
              </label>
            ))}
          </div>
          <span className="field-hint">Days nobody is expected to work. A punch on one is reported as weekend working (WOW).</span>
        </fieldset>
        <div className="form-actions">
          <Button type="submit" loading={update.isPending} disabled={!isDirty}>
            Save settings
          </Button>
        </div>
      </form>
    </Section>
  )
}

interface HolidayValues {
  holiday_date: string
  name: string
}

function HolidaysSection() {
  const toast = useToast()
  const today = useCompanyToday()
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const holidays = useHolidays(year)
  const add = useAddHoliday()
  const remove = useRemoveHoliday()
  const [removing, setRemoving] = useState<Holiday | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<HolidayValues>({ defaultValues: { holiday_date: '', name: '' } })

  const onAdd = handleSubmit((values) => {
    setFormError(null)
    add.mutate(
      { holiday_date: values.holiday_date, name: values.name.trim() },
      {
        onSuccess: (created) => {
          toast.success(`${created.name} added.`)
          setYear(Number(created.holiday_date.slice(0, 4)))
          reset({ holiday_date: '', name: '' })
        },
        onError: (error) => setFormError(applyApiError(error, setError, ['holiday_date', 'name'])),
      },
    )
  })

  return (
    <Section
      title={`Holidays · ${year}`}
      action={
        <span className="segmented" role="group" aria-label="Holiday year" style={{ marginBottom: 0 }}>
          <button type="button" className="segmented-item" onClick={() => setYear(year - 1)} aria-label={`Show ${year - 1}`}>
            ‹ {year - 1}
          </button>
          <button type="button" className="segmented-item" onClick={() => setYear(year + 1)} aria-label={`Show ${year + 1}`}>
            {year + 1} ›
          </button>
        </span>
      }
    >
      <form onSubmit={onAdd} noValidate className="stack" style={{ marginBottom: 16 }}>
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className="form-grid two">
          <Input label="Date" type="date" required error={errors.holiday_date?.message} {...register('holiday_date', { required: 'Choose the date.' })} />
          <Input
            label="Holiday name"
            required
            placeholder="e.g. Diwali"
            error={errors.name?.message}
            {...register('name', { required: 'Enter a name.', maxLength: { value: 120, message: 'At most 120 characters.' } })}
          />
        </div>
        <div className="form-actions">
          <Button type="submit" icon={<Plus size={16} />} loading={add.isPending}>
            Add holiday
          </Button>
        </div>
      </form>
      <QueryBoundary
        query={holidays}
        skeleton={<Skeleton height={80} />}
        isEmpty={(rows) => rows.length === 0}
        empty={<EmptyState title={`No holidays listed for ${year}`} description="Add the company's holidays above. They show as Holiday in the reports, and nobody is marked absent on them." />}
      >
        {(rows) => (
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Holidays in {year}</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Holiday</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((holiday) => (
                  <tr key={holiday.id}>
                    <td>{formatDate(holiday.holiday_date)}</td>
                    <td>{holiday.name}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Button size="sm" variant="outline" icon={<Trash2 size={14} />} onClick={() => setRemoving(holiday)} aria-label={`Remove ${holiday.name}`}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryBoundary>
      <ConfirmDialog
        open={removing !== null}
        title="Remove this holiday?"
        message={removing ? `${removing.name} (${formatDate(removing.holiday_date)}) will count as a normal working day again in the reports.` : ''}
        confirmLabel="Remove holiday"
        tone="danger"
        busy={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return
          remove.mutate(removing.id, {
            onSuccess: () => {
              toast.success(`${removing.name} removed.`)
              setRemoving(null)
            },
            onError: (error) => {
              toast.error(error instanceof Error ? error.message : 'Could not remove the holiday.')
              setRemoving(null)
            },
          })
        }}
      />
    </Section>
  )
}
