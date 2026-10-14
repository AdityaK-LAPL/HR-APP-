import { History } from 'lucide-react'
import { useState } from 'react'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { RangePresets } from '@/components/ui/RangePresets'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/features/auth/authContext'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { usePeople } from '@/features/people/usePeople'
import { useVisiblePeopleOptions } from '@/features/team/queries'
import { formatDate, formatDuration, formatTime } from '@/lib/dates'
import { ATTENDANCE_STATUS, WORK_MODE_SHORT } from '@/lib/labels'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { EventsDialog, MyAttendance } from './AttendancePage'
import { useTeamAttendance, type AttendanceDay } from './queries'

const PAGE_SIZE = 20

/**
 * Who punched in when, across the manager's team. Defaults to today; the date range and person
 * filters narrow it. Rows come from the API, so only people the manager may see appear.
 */
export function TeamAttendancePage() {
  const { user } = useAuth()
  const today = useCompanyToday()
  const [params, setParams] = useUrlParams({ view: 'team', from: '', to: '', person: '', page: '1' })
  const isOwner = user?.role === 'owner'
  const mine = !isOwner && params.view === 'mine'
  const page = pageNumber(params.page)
  const from = params.from || today
  // An end before the start would ask the API for an impossible range; treat it as a single day.
  const to = params.to && params.to >= from ? params.to : from
  const people = useVisiblePeopleOptions()
  const query = useTeamAttendance({
    start_date: from,
    end_date: to,
    ...(params.person ? { user_id: params.person } : {}),
    page,
    page_size: PAGE_SIZE,
  })
  const { nameOf } = usePeople((query.data?.items ?? []).map((day) => day.user_id))
  const [detail, setDetail] = useState<{ userId: string; date: string } | null>(null)

  const columns: Column<AttendanceDay>[] = [
    { key: 'who', header: 'Employee', primary: true, cell: (d) => (d.user_id === user?.id ? 'You' : nameOf(d.user_id, '…')) },
    { key: 'date', header: 'Date', cell: (d) => formatDate(d.work_date) },
    { key: 'in', header: 'In', cell: (d) => formatTime(d.punch_in_time) || '—' },
    { key: 'out', header: 'Out', cell: (d) => formatTime(d.punch_out_time) || '—' },
    { key: 'dur', header: 'Worked', cell: (d) => formatDuration(d.total_duration_minutes) || '—' },
    {
      key: 'mode',
      header: 'Worked as',
      cell: (d) => (d.work_mode ? `${WORK_MODE_SHORT[d.work_mode]}${d.remark ? ` · ${d.remark}` : ''}` : '—'),
    },
    { key: 'status', header: 'Status', cell: (d) => <StatusBadge table={ATTENDANCE_STATUS} value={d.status} /> },
    {
      key: 'actions',
      header: 'Details',
      cell: (d) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDetail({ userId: d.user_id, date: d.work_date })}
          aria-label={`Show punches of ${nameOf(d.user_id, 'employee')} on ${formatDate(d.work_date)}`}
        >
          Punches
        </Button>
      ),
    },
  ]

  return (
    <section>
      <PageHeader
        title="Attendance"
        description={mine ? 'Punch in and out, and review your own attendance.' : isOwner ? 'See who has punched in across the company.' : 'See who has punched in across your team.'}
      />
      {!isOwner && (
      <SegmentedControl
        label="Attendance view"
        value={mine ? 'mine' : 'team'}
        onChange={(view) => setParams({ view })}
        options={[
          { value: 'team', label: 'Team' },
          { value: 'mine', label: 'My attendance' },
        ]}
      />
      )}
      {mine ? (
        <MyAttendance />
      ) : (
        <>
          <div className="toolbar">
            <Select
              label="Employee"
              value={params.person}
              onChange={(event) => setParams({ person: event.target.value })}
              options={people.options}
              placeholder="Everyone"
            />
            <RangePresets today={today} from={from} to={to} onChange={(a, b) => setParams({ from: a, to: b })} />
            <Input label="From" type="date" value={from} onChange={(event) => setParams({ from: event.target.value })} />
            <Input label="To" type="date" value={to} min={from} onChange={(event) => setParams({ to: event.target.value })} />
            {(params.from || params.to || params.person) && (
              <Button variant="ghost" onClick={() => setParams({ from: '', to: '', person: '' })}>
                Back to today
              </Button>
            )}
          </div>
          <QueryBoundary
            query={query}
            isEmpty={(data) => data.items.length === 0}
            empty={
              <EmptyState
                icon={<History size={24} />}
                title="No attendance records"
                description={from === today && to === today ? (isOwner ? 'Nobody has punched in yet today.' : 'Nobody in your team has punched in yet today.') : 'No one punched in during this period.'}
              />
            }
          >
            {(data) => (
              <>
                <p aria-live="polite" style={{ marginBottom: 10 }}>
                  {data.total} {data.total === 1 ? 'record' : 'records'} for {from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`}
                </p>
                <RecordList rows={data.items} columns={columns} rowKey={(d) => d.id} caption="Team attendance" />
                <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
              </>
            )}
          </QueryBoundary>
          <EventsDialog userId={detail?.userId ?? ''} date={detail?.date ?? null} onClose={() => setDetail(null)} />
        </>
      )}
    </section>
  )
}
