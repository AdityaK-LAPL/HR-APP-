import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { useAuth } from '@/features/auth/authContext'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { usePeople } from '@/features/people/usePeople'
import { useProjects } from '@/features/projects/queries'
import { useVisiblePeopleOptions } from '@/features/team/queries'
import { WEEKDAYS, addMonths, dayOfMonth, monthEnd, monthGrid, monthLabel, monthOf, monthStart } from '@/lib/calendar'
import { formatDate } from '@/lib/dates'
import { LEAVE_STATUS, TASK_STATUS, labelOf } from '@/lib/labels'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useUrlParams } from '@/lib/useUrlParams'
import { groupByDate, useCalendar, type CalendarEntry } from './queries'

const VISIBLE_PER_DAY = 3

function EntryLine({ entry, who, showPerson = true }: { entry: CalendarEntry; who: string; showPerson?: boolean }) {
  const status =
    entry.entry_type === 'leave' ? labelOf(LEAVE_STATUS, entry.status) : labelOf(TASK_STATUS, entry.status)
  return (
    <span className="meta-line">
      <span className={`badge ${entry.entry_type === 'leave' ? 'badge-warning' : 'badge-info'}`}>
        {entry.entry_type === 'leave' ? 'Leave' : 'Task'}
      </span>
      <span>
        {showPerson ? <strong>{who}</strong> : null}
        {showPerson ? ' · ' : ''}
        {entry.entry_type === 'leave' ? status : `${entry.title} (${status})`}
      </span>
    </span>
  )
}

/**
 * Tasks and leave across the team for one month. The API decides whose entries appear; the filters
 * only narrow them. Leave is listed on its first day (that is how the API reports it).
 */
export function CalendarPage() {
  const { user } = useAuth()
  const today = useCompanyToday()
  const wide = useMediaQuery('(min-width: 768px)')
  const [params, setParams] = useUrlParams({ m: '', person: '', project: '', reports: '' })
  const month = params.m || monthOf(today)
  const people = useVisiblePeopleOptions()
  const projects = useProjects({ page: 1, page_size: 100 })
  const [openDay, setOpenDay] = useState<string | null>(null)

  const query = useCalendar({
    start_date: monthStart(month),
    end_date: monthEnd(month),
    ...(params.person ? { user_id: params.person } : {}),
    ...(params.project ? { project_id: params.project } : {}),
    ...(params.reports === 'direct' && user ? { team: user.id } : {}),
  })
  const { nameOf } = usePeople((query.data ?? []).map((entry) => entry.user_id))
  const who = (entry: CalendarEntry) => (entry.user_id === user?.id ? 'You' : nameOf(entry.user_id, '…'))
  const go = (delta: number) => setParams({ m: addMonths(month, delta) === monthOf(today) ? '' : addMonths(month, delta) })
  const filtered = Boolean(params.person || params.project || params.reports)

  return (
    <section>
      <PageHeader title="Team calendar" description="Tasks and leave across your team, month by month." />

      <div className="toolbar">
        <Select
          label="Person"
          value={params.person}
          onChange={(event) => setParams({ person: event.target.value })}
          options={people.options}
          placeholder="Everyone"
        />
        <Select
          label="Project"
          value={params.project}
          onChange={(event) => setParams({ project: event.target.value })}
          options={(projects.data?.items ?? []).map((project) => ({ value: project.id, label: project.name }))}
          placeholder="All projects"
        />
        <Select
          label="Team"
          value={params.reports}
          onChange={(event) => setParams({ reports: event.target.value })}
          options={[{ value: 'direct', label: 'My direct reports only' }]}
          placeholder="Everyone I can see"
        />
        {filtered && (
          <Button variant="ghost" onClick={() => setParams({ person: '', project: '', reports: '' })}>
            Clear filters
          </Button>
        )}
      </div>

      <div className="calendar-nav">
        <Button variant="outline" size="sm" icon={<ChevronLeft size={16} />} onClick={() => go(-1)} aria-label="Previous month">
          Previous
        </Button>
        <h2 aria-live="polite">{monthLabel(month)}</h2>
        <Button variant="outline" size="sm" onClick={() => go(1)} aria-label="Next month">
          Next <ChevronRight size={16} aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setParams({ m: '' })} disabled={month === monthOf(today)}>
          This month
        </Button>
      </div>

      <QueryBoundary query={query}>
        {(entries) => {
          const byDate = groupByDate(entries)
          if (entries.length === 0) {
            return (
              <EmptyState
                icon={<CalendarDays size={24} />}
                title={filtered ? 'Nothing matches these filters this month' : `Nothing scheduled in ${monthLabel(month)}`}
                description="Tasks with a task date and leave requests show up here."
              />
            )
          }

          if (!wide) {
            const days = [...byDate.keys()].sort()
            return (
              <ul className="card-list" aria-label={`Entries in ${monthLabel(month)}`}>
                {days.map((day) => (
                  <li key={day} className="record-card glass-card">
                    <div className="record-card-title">
                      {formatDate(day)}
                      {day === today ? ' · today' : ''}
                    </div>
                    <ul style={{ listStyle: 'none' }} className="stack">
                      {byDate.get(day)?.map((entry, index) => (
                        <li key={index}>
                          <EntryLine entry={entry} who={who(entry)} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )
          }

          return (
            <div className="table-wrap">
              <table className="table calendar-grid">
                <caption className="visually-hidden">{monthLabel(month)}</caption>
                <thead>
                  <tr>
                    {WEEKDAYS.map((weekday) => (
                      <th key={weekday} scope="col">
                        {weekday}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthGrid(month).map((week) => (
                    <tr key={week[0]}>
                      {week.map((day) => {
                        const inMonth = monthOf(day) === month
                        const dayEntries = inMonth ? (byDate.get(day) ?? []) : []
                        return (
                          <td key={day} className={`calendar-day${inMonth ? '' : ' outside'}${day === today ? ' today' : ''}`}>
                            <div className="calendar-day-number">{dayOfMonth(day)}</div>
                            {dayEntries.slice(0, VISIBLE_PER_DAY).map((entry, index) => (
                              <div key={index} className={`calendar-chip ${entry.entry_type}`}>
                                {entry.entry_type === 'leave' ? `${who(entry)} · leave` : `${who(entry)} · ${entry.title}`}
                              </div>
                            ))}
                            {dayEntries.length > 0 && (
                              <button
                                type="button"
                                className="calendar-more"
                                onClick={() => setOpenDay(day)}
                                aria-label={`Show all ${dayEntries.length} ${dayEntries.length === 1 ? 'entry' : 'entries'} on ${formatDate(day)}`}
                              >
                                {dayEntries.length > VISIBLE_PER_DAY ? `+${dayEntries.length - VISIBLE_PER_DAY} more` : 'Details'}
                              </button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }}
      </QueryBoundary>

      <Dialog open={openDay !== null} onClose={() => setOpenDay(null)} title={openDay ? formatDate(openDay) : 'Day'}>
        <ul style={{ listStyle: 'none' }} className="stack">
          {(query.data ?? [])
            .filter((entry) => entry.entry_date === openDay)
            .map((entry, index) => (
              <li key={index}>
                <EntryLine entry={entry} who={who(entry)} />
                {entry.entry_type === 'leave' && <Link to={`/users/${entry.user_id}`}>Open {who(entry)}</Link>}
              </li>
            ))}
        </ul>
      </Dialog>
    </section>
  )
}
