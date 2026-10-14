import { Download } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/feedback/toastContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/fields'
import { Section } from '@/components/ui/PageHeader'
import { monthLabel } from '@/lib/calendar'
import { downloadFile } from '@/lib/download'

export interface PersonOption {
  id: string
  name: string
  code: string
}

/** One download: the button shows progress, and a failure is said out loud (never a silent empty file). */
function DownloadButton({
  label,
  path,
  query,
  fallbackName,
  disabled,
}: {
  label: string
  path: string
  query: Record<string, string>
  fallbackName: string
  disabled?: boolean
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const name = await downloadFile(path, { query }, fallbackName)
      toast.success(`${name} downloaded.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The download failed. Please try again.', 'Download failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button icon={<Download size={16} />} loading={busy} disabled={disabled} needsConnection={false} onClick={() => void run()}>
      {label}
    </Button>
  )
}

/**
 * The four Excel reports. Each opens in Excel with the same layout the company already uses: the
 * monthly attendance of one employee, the day report of everyone, the leave card of one employee
 * and a month summary of all employees (with a day-by-day register on a second sheet).
 */
export function DownloadsPanel({
  month,
  today,
  people,
  financialYear,
}: {
  month: string
  today: string
  people: readonly PersonOption[]
  /** The year the leave card's financial year (April - March) starts in. */
  financialYear: number
}) {
  const [employee, setEmployee] = useState('')
  const [day, setDay] = useState(today)
  const options = people.map((person) => ({ value: person.id, label: `${person.name} (${person.code})` }))
  const chosen = people.find((person) => person.id === employee)
  const noPerson = employee === ''
  const fyLabel = `April ${financialYear} - March ${financialYear + 1}`
  return (
    <Section title="Download as Excel (.xlsx)">
      <p style={{ marginBottom: 12, fontSize: 13 }}>
        Every download is recorded in the audit trail. The month is the one chosen above ({monthLabel(month)}); leave cards cover {fyLabel}.
      </p>
      <div className="stack">
        <div className="form-grid two">
          <Select
            label="Employee"
            value={employee}
            onChange={(event) => setEmployee(event.target.value)}
            options={options}
            placeholder="Choose an employee"
            hint="Used for the monthly attendance and the leave card."
          />
          <Input label="Day (for the daily report)" type="date" value={day} max={today} onChange={(event) => setDay(event.target.value)} />
        </div>
        <div className="form-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
          <DownloadButton
            label="Monthly attendance"
            path="/reports/exports/attendance-monthly"
            query={{ employee_id: employee, month }}
            fallbackName={`Attendance_${chosen?.name ?? 'Employee'}_${month}.xlsx`}
            disabled={noPerson}
          />
          <DownloadButton
            label="Leave card"
            path="/reports/exports/leave-card"
            query={{ employee_id: employee, start_date: `${financialYear}-04-01`, end_date: `${financialYear + 1}-03-31` }}
            fallbackName={`LeaveCard_${chosen?.name ?? 'Employee'}.xlsx`}
            disabled={noPerson}
          />
          <DownloadButton
            label="Daily report"
            path="/reports/exports/attendance-daily"
            query={{ date: day }}
            fallbackName={`DayReport_${day}.xlsx`}
            disabled={!day}
          />
          <DownloadButton
            label="Monthly summary (everyone)"
            path="/reports/exports/attendance-summary"
            query={{ month }}
            fallbackName={`AttendanceSummary_${month}.xlsx`}
          />
        </div>
        {noPerson && <p style={{ fontSize: 13 }}>Choose an employee to enable the monthly attendance and the leave card.</p>}
      </div>
    </Section>
  )
}
