import { History } from 'lucide-react'
import { useState } from 'react'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/features/auth/authContext'
import { formatDate, formatDuration, formatTime } from '@/lib/dates'
import { ATTENDANCE_STATUS } from '@/lib/labels'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { PunchCard } from './PunchCard'
import { useAttendanceEvents, useAttendanceHistory, type AttendanceDay } from './queries'

const PAGE_SIZE = 20

function EventsDialog({ userId, date, onClose }: { userId: string; date: string | null; onClose: () => void }) {
  const events = useAttendanceEvents(userId, date)
  return (
    <Dialog open={date !== null} onClose={onClose} title={date ? `Punches on ${formatDate(date)}` : 'Punches'}>
      <QueryBoundary query={events} isEmpty={(rows) => rows.length === 0} empty={<p>No punches recorded.</p>}>
        {(rows) => (
          <ol className="timeline">
            {rows.map((event) => (
              <li key={event.id}>
                <time dateTime={event.event_time}>{formatTime(event.event_time)}</time>
                <strong>{event.event_type === 'punch_in' ? 'Punched in' : 'Punched out'}</strong>
                {event.location_label ? ` · ${event.location_label}` : ' · no location recorded'}
              </li>
            ))}
          </ol>
        )}
      </QueryBoundary>
    </Dialog>
  )
}

export function AttendancePage() {
  const { user } = useAuth()
  const [params, setParams] = useUrlParams({ from: '', to: '', page: '1' })
  const page = pageNumber(params.page)
  const query = useAttendanceHistory(user?.id, {
    ...(params.from ? { start_date: params.from } : {}),
    ...(params.to ? { end_date: params.to } : {}),
    page,
    page_size: PAGE_SIZE,
  })
  const [detailDate, setDetailDate] = useState<string | null>(null)

  const columns: Column<AttendanceDay>[] = [
    { key: 'date', header: 'Date', primary: true, cell: (d) => formatDate(d.work_date) },
    { key: 'in', header: 'In', cell: (d) => formatTime(d.punch_in_time) || '—' },
    { key: 'out', header: 'Out', cell: (d) => formatTime(d.punch_out_time) || '—' },
    { key: 'dur', header: 'Worked', cell: (d) => formatDuration(d.total_duration_minutes) || '—' },
    { key: 'status', header: 'Status', cell: (d) => <StatusBadge table={ATTENDANCE_STATUS} value={d.status} /> },
    {
      key: 'actions',
      header: 'Details',
      cell: (d) => (
        <Button size="sm" variant="outline" onClick={() => setDetailDate(d.work_date)} aria-label={`Show punches on ${formatDate(d.work_date)}`}>
          Punches
        </Button>
      ),
    },
  ]

  return (
    <section>
      <PageHeader title="Attendance" description="Punch in and out, and review your attendance." />
      <PunchCard />
      <Section title="History">
        <div className="toolbar">
          <Input label="From" type="date" value={params.from} onChange={(e) => setParams({ from: e.target.value })} />
          <Input label="To" type="date" value={params.to} onChange={(e) => setParams({ to: e.target.value })} />
          {(params.from || params.to) && (
            <Button variant="ghost" onClick={() => setParams({ from: '', to: '' })}>
              Clear
            </Button>
          )}
        </div>
        <QueryBoundary
          query={query}
          isEmpty={(data) => data.items.length === 0}
          empty={<EmptyState icon={<History size={24} />} title="No attendance records" description="Records appear after you punch in." />}
        >
          {(data) => (
            <>
              <RecordList rows={data.items} columns={columns} rowKey={(d) => d.id} caption="Attendance history" />
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
            </>
          )}
        </QueryBoundary>
      </Section>
      {user && <EventsDialog userId={user.id} date={detailDate} onClose={() => setDetailDate(null)} />}
    </section>
  )
}
