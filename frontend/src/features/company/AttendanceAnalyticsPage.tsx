import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { HBarChart } from '@/components/charts/HBarChart'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { SortableTable, type SortColumn } from '@/components/data/SortableTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth/authContext'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { addMonths, dayOfMonth, monthLabel, monthOf } from '@/lib/calendar'
import { formatDate, formatDuration } from '@/lib/dates'
import { DownloadsPanel } from './DownloadsPanel'
import {
  useAttendanceAnalytics,
  useCanOpenCompanyReports,
  useLeaveAnalytics,
  type AttendanceAnalytics,
  type LeaveAnalytics,
} from './queries'

type PersonRow = AttendanceAnalytics['people'][number]
type LeaveRow = LeaveAnalytics['people'][number]

/** "09:42" from minutes after midnight (company time). */
function clock(minutes: number | null): string {
  if (minutes === null) return '-'
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** What people actually did (the calendar's own weekly offs and holidays are not "doing"). */
const doingOf = (data: AttendanceAnalytics) =>
  data.by_type.filter((row) => row.count > 0 && row.code !== 'W/Off' && row.code !== 'Holiday')

const days = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

/** The financial year (April - March) a date falls in, named by the year it starts in. */
function financialYearOf(iso: string): number {
  const year = Number(iso.slice(0, 4))
  return Number(iso.slice(5, 7)) >= 4 ? year : year - 1
}

const PERSON_COLUMNS: readonly SortColumn<PersonRow>[] = [
  { key: 'name', header: 'Employee', cell: (row) => <>{row.name} <span className="field-hint">({row.employee_code})</span></>, sortValue: (row) => row.name },
  { key: 'worked', header: 'Days worked', cell: (row) => days(row.days_worked), sortValue: (row) => row.days_worked, numeric: true },
  { key: 'office', header: 'At office', cell: (row) => row.at_office, sortValue: (row) => row.at_office, numeric: true },
  { key: 'wfh', header: 'Work from home', cell: (row) => row.work_from_home, sortValue: (row) => row.work_from_home, numeric: true },
  { key: 'od', header: 'On duty', cell: (row) => row.on_duty, sortValue: (row) => row.on_duty, numeric: true },
  { key: 'wow', header: 'Weekend / holiday work', cell: (row) => row.weekend_or_holiday_working, sortValue: (row) => row.weekend_or_holiday_working, numeric: true },
  { key: 'leave', header: 'Leave days', cell: (row) => days(row.leave_days), sortValue: (row) => row.leave_days, numeric: true },
  { key: 'comp', header: 'Comp-off', cell: (row) => row.comp_off, sortValue: (row) => row.comp_off, numeric: true },
  { key: 'absent', header: 'Absent', cell: (row) => row.absent, sortValue: (row) => row.absent, numeric: true },
  { key: 'avg', header: 'Avg hours / day', cell: (row) => (row.average_minutes === null ? '-' : formatDuration(row.average_minutes)), sortValue: (row) => row.average_minutes ?? -1, numeric: true },
  { key: 'late', header: 'Late', cell: (row) => row.late_count, sortValue: (row) => row.late_count, numeric: true },
  { key: 'in', header: 'Avg punch-in', cell: (row) => clock(row.average_in_minute), sortValue: (row) => row.average_in_minute ?? -1, numeric: true },
]

const LEAVE_COLUMNS: readonly SortColumn<LeaveRow>[] = [
  { key: 'name', header: 'Employee', cell: (row) => <>{row.name} <span className="field-hint">({row.employee_code})</span></>, sortValue: (row) => row.name },
  { key: 'days', header: 'Leave days', cell: (row) => days(row.leave_days), sortValue: (row) => row.leave_days, numeric: true },
  { key: 'full', header: 'Full days', cell: (row) => row.full_days, sortValue: (row) => row.full_days, numeric: true },
  { key: 'half', header: 'Half days', cell: (row) => row.half_days, sortValue: (row) => row.half_days, numeric: true },
  { key: 'comp', header: 'Comp-off', cell: (row) => row.comp_off_days, sortValue: (row) => row.comp_off_days, numeric: true },
  { key: 'up', header: 'Still to come', cell: (row) => days(row.upcoming_days), sortValue: (row) => row.upcoming_days, numeric: true },
]

function Tile({ value, label }: { value: string | number | undefined; label: string }) {
  return (
    <div className="stat glass-card">
      <div className="stat-value">{value === undefined ? <Skeleton height={32} width={48} /> : value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

/**
 * Company-wide attendance and leave analytics, plus the Excel downloads. For the Owner, and for a
 * manager the Owner allowed to download company reports (the API enforces it: everyone else gets 403).
 */
export function AttendanceAnalyticsPage() {
  const { user } = useAuth()
  const allowed = useCanOpenCompanyReports()
  const today = useCompanyToday()
  const thisMonth = monthOf(today)
  const [month, setMonth] = useState(thisMonth)
  const [fy, setFy] = useState(financialYearOf(today))
  const attendance = useAttendanceAnalytics(month, allowed)
  const leave = useLeaveAnalytics(fy, allowed)

  const monthOptions = useMemo(
    () => Array.from({ length: 24 }, (_, index) => addMonths(thisMonth, -index)).map((value) => ({ value, label: monthLabel(value) })),
    [thisMonth],
  )
  const fyNow = financialYearOf(today)
  const fyOptions = useMemo(
    () => [0, 1, 2, 3].map((back) => ({ value: String(fyNow - back), label: `${fyNow - back}-${String(fyNow - back + 1).slice(2)}` })),
    [fyNow],
  )

  const people = useMemo(
    () => (attendance.data?.people ?? []).map((row) => ({ id: row.user_id, name: row.name, code: row.employee_code })),
    [attendance.data],
  )

  if (!allowed) {
    return (
      <section>
        <PageHeader title="Attendance analytics" />
        <EmptyState
          title="Not available"
          description={
            user?.role === 'manager'
              ? 'The Owner has not allowed you to download company attendance reports. Ask the Owner to grant the "Download company attendance reports" permission.'
              : 'This screen is for the Owner and the people the Owner allows.'
          }
        />
      </section>
    )
  }

  return (
    <section>
      <PageHeader
        title="Attendance analytics"
        description="How the whole company is attending, who is on leave, and the Excel reports for HR. Figures come straight from the punch and leave records."
      />
      <div className="toolbar">
        <Select label="Month" value={month} onChange={(event) => setMonth(event.target.value)} options={monthOptions} />
        <Select label="Financial year (leave)" value={String(fy)} onChange={(event) => setFy(Number(event.target.value))} options={fyOptions} />
      </div>

      <QueryBoundary query={attendance} skeleton={<Skeleton height={220} />}>
        {(data) => (
          <>
            <div className="stat-grid">
              <Tile value={data.employees} label="Employees" />
              <Tile value={data.average_attendance_percent === null ? '-' : `${Math.round(data.average_attendance_percent)}%`} label="Average attendance" />
              <Tile value={data.average_minutes_per_day === null ? '-' : formatDuration(data.average_minutes_per_day)} label="Avg hours per day" />
              <Tile value={data.late_arrivals} label="Late arrivals" />
              <Tile value={days(data.leave_days)} label="Leave days taken" />
              <Tile value={data.working_days} label="Working days so far" />
            </div>

            {data.employees === 0 ? (
              <EmptyState title="No employees to report on" description="Add people first; their attendance shows here." />
            ) : (
              <>
                <Section title={`People working each day · ${monthLabel(month)}`}>
                  <ColumnChart
                    title={`People working each day in ${monthLabel(month)}`}
                    unit="people"
                    points={data.daily.map((point) => ({
                      key: point.date,
                      label: String(dayOfMonth(point.date)),
                      value: point.at_office + point.work_from_home + point.on_duty + point.weekend_or_holiday_working,
                      muted: point.weekly_off || point.holiday,
                      title: formatDate(point.date) + (point.holiday ? ' (holiday)' : point.weekly_off ? ' (weekly off)' : ''),
                    }))}
                  />
                </Section>

                <div className="form-grid two">
                  <Section title="What people did this month">
                    <HBarChart
                      title={`Person-days by type in ${monthLabel(month)}`}
                      unit="person-days"
                      total={doingOf(data).reduce((sum, row) => sum + row.count, 0)}
                      rows={doingOf(data)
                        .map((row) => ({ key: row.code, label: `${row.code} · ${row.meaning}`, value: row.count, emphasis: row.code === 'Absent' }))}
                    />
                  </Section>
                  <Section title="Most days absent">
                    <HBarChart
                      title={`Absent days per employee in ${monthLabel(month)}`}
                      unit="days"
                      rows={[...data.people]
                        .filter((row) => row.absent > 0)
                        .sort((a, b) => b.absent - a.absent)
                        .slice(0, 8)
                        .map((row) => ({ key: row.user_id, label: row.name, value: row.absent, emphasis: true }))}
                    />
                    {data.people.every((row) => row.absent === 0) && <p>Nobody was absent.</p>}
                  </Section>
                </div>

                <Section title={`Per employee · ${monthLabel(month)}`}>
                  <SortableTable
                    rows={data.people}
                    columns={PERSON_COLUMNS}
                    rowKey={(row) => row.user_id}
                    caption={`Attendance per employee in ${monthLabel(month)}`}
                    initial={{ key: 'name', direction: 'asc' }}
                  />
                </Section>
              </>
            )}
          </>
        )}
      </QueryBoundary>

      <QueryBoundary query={leave} skeleton={<Skeleton height={160} />}>
        {(data) => (
          <Section title={`Leave · ${data.financial_year}-${String(data.financial_year + 1).slice(2)}`}>
            <div className="stat-grid">
              <Tile value={days(data.total_leave_days)} label="Leave days (approved)" />
              <Tile value={days(data.taken_days)} label="Already taken" />
              <Tile value={days(data.upcoming_days)} label="Still to come" />
            </div>
            <HBarChart
              title={`Leave days by month in ${data.financial_year}-${String(data.financial_year + 1).slice(2)}`}
              unit="days"
              rows={data.by_month.map((point) => ({ key: point.month, label: monthLabel(point.month), value: point.leave_days }))}
            />
            <div style={{ marginTop: 16 }}>
              <SortableTable
                rows={data.people}
                columns={LEAVE_COLUMNS}
                rowKey={(row) => row.user_id}
                caption="Leave per employee"
                initial={{ key: 'days', direction: 'desc' }}
              />
            </div>
          </Section>
        )}
      </QueryBoundary>

      <DownloadsPanel month={month} today={today} people={people} financialYear={fy} />
      <p style={{ fontSize: 13, marginTop: 12 }}>
        Weekly offs, holidays and the late-arrival time come from{' '}
        {user?.role === 'owner' ? <Link className="inline-link" to="/company-settings">Company settings</Link> : 'the company settings'}, which only the Owner can change.
      </p>
    </section>
  )
}
