import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/fields'
import { useAuth } from '@/features/auth/authContext'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { usePeople } from '@/features/people/usePeople'
import { useProjects } from '@/features/projects/queries'
import { useVisiblePeopleOptions } from '@/features/team/queries'
import { WEEKDAYS, addDays, addMonths, dayOfMonth, monthEnd, monthGrid, monthLabel, monthOf, monthStart, weekdayIndex } from '@/lib/calendar'
import { formatDate } from '@/lib/dates'
import { LEAVE_STATUS, TASK_STATUS, labelOf } from '@/lib/labels'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useUrlParams } from '@/lib/useUrlParams'
import { groupByDate, spreadLeave, useCalendar, useCalendarLeaves, type CalendarEntry } from './queries'

const VISIBLE_PER_DAY = 3

function EntryLine({ entry, who, showPerson = true }: { entry: CalendarEntry; who: string; showPerson?: boolean }) {
  const status = entry.entry_type === 'leave' ? labelOf(LEAVE_STATUS, entry.status) : labelOf(TASK_STATUS, entry.status)
  return (
    <span className="meta-line">
      <span className={`badge ${entry.entry_type === 'leave' ? 'badge-warning' : 'badge-info'}`}>{entry.entry_type === 'leave' ? 'Leave' : 'Task'}</span>
      <span>
        {showPerson ? <strong>{who}</strong> : null}
        {showPerson ? ' · ' : ''}
        {entry.entry_type === 'leave' ? status : `${entry.title} (${status})`}
      </span>
    </span>
  )
}

const chipText = (entry: CalendarEntry, who: string) =>
  entry.entry_type === 'leave' ? `${who} · leave${entry.status === 'pending' ? ' (pending)' : ''}` : `${who} · ${entry.title}`

/**
 * Tasks and leave over time, as a month grid, a week, or a list. The API decides whose entries
 * appear (an employee's own, a manager's team, the whole company for the Owner); the filters only
 * narrow them. A leave is shown on every day it covers where the request itself is readable.
 */
export function CalendarPage() {
  const { user } = useAuth()
  const isEmployee = user?.role === 'employee'
  const today = useCompanyToday()
  const wide = useMediaQuery('(min-width: 768px)')
  const [params, setParams] = useUrlParams({ view: 'month', show: 'all', m: '', d: '', person: '', project: '', reports: '' })
  const week = params.view === 'week'
  const list = params.view === 'list' || (!wide && !week)
  const month = params.m || monthOf(today)
  const anchor = params.d || today
  const weekStart = addDays(anchor, -weekdayIndex(anchor))
  const from = week ? weekStart : monthStart(month)
  const to = week ? addDays(weekStart, 6) : monthEnd(month)
  const people = useVisiblePeopleOptions()
  const projects = useProjects({ page: 1, page_size: 100 })
  const [openDay, setOpenDay] = useState<string | null>(null)

  const query = useCalendar({
    start_date: from,
    end_date: to,
    ...(params.person ? { user_id: params.person } : {}),
    ...(params.project ? { project_id: params.project } : {}),
    ...(params.reports === 'direct' && user ? { team: user.id } : {}),
  })
  const leaves = useCalendarLeaves(params.show !== 'task')
  const { nameOf } = usePeople((query.data ?? []).map((entry) => entry.user_id))
  const who = (entry: CalendarEntry) => (entry.user_id === user?.id ? 'You' : nameOf(entry.user_id, '…'))
  const entriesOf = (raw: readonly CalendarEntry[]) =>
    spreadLeave(raw, leaves.data ?? [], from, to).filter((entry) => params.show === 'all' || entry.entry_type === params.show)
  const goMonth = (delta: number) => setParams({ m: addMonths(month, delta) === monthOf(today) ? '' : addMonths(month, delta) })
  const goWeek = (delta: number) => setParams({ d: addDays(weekStart, delta * 7) === addDays(today, -weekdayIndex(today)) ? '' : addDays(weekStart, delta * 7) })
  const filtered = Boolean(params.person || params.project || params.reports || params.show !== 'all')
  const title = week ? `${formatDate(from)} – ${formatDate(to)}` : monthLabel(month)
  const atToday = week ? weekStart === addDays(today, -weekdayIndex(today)) : month === monthOf(today)

  return (
    <section>
      <PageHeader title={isEmployee ? 'My calendar' : 'Team calendar'} description={isEmployee ? 'Your tasks and leave, by month or week.' : 'Tasks and leave across your team, by month or week.'} />

      <div className="toolbar">
        <SegmentedControl
          label="Calendar view"
          value={params.view === 'week' ? 'week' : params.view === 'list' ? 'list' : 'month'}
          onChange={(view) => setParams({ view })}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'week', label: 'Week' },
            { value: 'list', label: 'List' },
          ]}
        />
        <SegmentedControl
          label="Show"
          value={params.show === 'task' ? 'task' : params.show === 'leave' ? 'leave' : 'all'}
          onChange={(show) => setParams({ show })}
          options={[
            { value: 'all', label: 'Tasks and leave' },
            { value: 'task', label: 'Tasks' },
            { value: 'leave', label: 'Leave' },
          ]}
        />
      </div>
      <div className="toolbar">
        {!isEmployee && (
          <>
            <Select label="Person" value={params.person} onChange={(event) => setParams({ person: event.target.value })} options={people.options} placeholder="Everyone" />
            <Select
              label="Project"
              value={params.project}
              onChange={(event) => setParams({ project: event.target.value })}
              options={(projects.data?.items ?? []).map((project) => ({ value: project.id, label: project.name }))}
              placeholder="All projects"
            />
            <Select label="Team" value={params.reports} onChange={(event) => setParams({ reports: event.target.value })} options={[{ value: 'direct', label: 'My direct reports only' }]} placeholder="Everyone I can see" />
          </>
        )}
        {isEmployee && (
          <Select label="Project" value={params.project} onChange={(event) => setParams({ project: event.target.value })} options={(projects.data?.items ?? []).map((project) => ({ value: project.id, label: project.name }))} placeholder="All projects" />
        )}
        {filtered && (
          <Button variant="ghost" onClick={() => setParams({ person: '', project: '', reports: '', show: '' })}>
            Clear filters
          </Button>
        )}
      </div>

      <div className="calendar-nav">
        <Button variant="outline" size="sm" icon={<ChevronLeft size={16} />} onClick={() => (week ? goWeek(-1) : goMonth(-1))} aria-label={week ? 'Previous week' : 'Previous month'}>
          Previous
        </Button>
        <h2 aria-live="polite">{title}</h2>
        <Button variant="outline" size="sm" onClick={() => (week ? goWeek(1) : goMonth(1))} aria-label={week ? 'Next week' : 'Next month'}>
          Next <ChevronRight size={16} aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setParams({ m: '', d: '' })} disabled={atToday}>
          {week ? 'This week' : 'This month'}
        </Button>
      </div>

      <QueryBoundary query={query}>
        {(raw) => {
          const entries = entriesOf(raw)
          const byDate = groupByDate(entries)
          if (entries.length === 0) {
            return (
              <EmptyState
                icon={<CalendarDays size={24} />}
                title={filtered ? 'Nothing matches these filters' : `Nothing scheduled ${week ? 'this week' : `in ${monthLabel(month)}`}`}
                description="Tasks with a task date and leave requests show up here."
              />
            )
          }

          if (list || (!wide && week)) {
            const days = [...byDate.keys()].sort()
            return (
              <ul className="card-list" aria-label={`Entries ${week ? 'this week' : `in ${monthLabel(month)}`}`}>
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

          if (week) {
            const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
            return (
              <div className="table-wrap">
                <table className="table calendar-grid calendar-week">
                  <caption className="visually-hidden">{title}</caption>
                  <thead>
                    <tr>
                      {days.map((day, index) => (
                        <th key={day} scope="col">
                          {WEEKDAYS[index]} {dayOfMonth(day)}
                          {day === today ? ' · today' : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {days.map((day) => (
                        <td key={day} className={`calendar-day week${day === today ? ' today' : ''}`}>
                          {(byDate.get(day) ?? []).map((entry, index) => (
                            <div key={index} className={`calendar-chip ${entry.entry_type} wrap`}>
                              {chipText(entry, who(entry))}
                            </div>
                          ))}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
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
                  {monthGrid(month).map((weekDays) => (
                    <tr key={weekDays[0]}>
                      {weekDays.map((day) => {
                        const inMonth = monthOf(day) === month
                        const dayEntries = inMonth ? (byDate.get(day) ?? []) : []
                        return (
                          <td key={day} className={`calendar-day${inMonth ? '' : ' outside'}${day === today ? ' today' : ''}`}>
                            <div className="calendar-day-number">{dayOfMonth(day)}</div>
                            {dayEntries.slice(0, VISIBLE_PER_DAY).map((entry, index) => (
                              <div key={index} className={`calendar-chip ${entry.entry_type}`}>
                                {chipText(entry, who(entry))}
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
          {entriesOf(query.data ?? [])
            .filter((entry) => entry.entry_date === openDay)
            .map((entry, index) => (
              <li key={index}>
                <EntryLine entry={entry} who={who(entry)} />
                {entry.entry_type === 'leave' && !isEmployee && <Link to={`/users/${entry.user_id}`}>Open {who(entry)}</Link>}
              </li>
            ))}
        </ul>
      </Dialog>
    </section>
  )
}
