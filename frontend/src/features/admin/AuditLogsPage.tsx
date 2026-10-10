import { History } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Pagination } from '@/components/data/Pagination'
import { RecordList, type Column } from '@/components/data/RecordList'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { usePeople } from '@/features/people/usePeople'
import { personLabel, useVisibleUsers } from '@/features/team/queries'
import { formatDateTime } from '@/lib/dates'
import { pageNumber, useUrlParams } from '@/lib/useUrlParams'
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, UUID, actionLabel, entityLabel, entityPath } from './auditLabels'
import { useAuditLogs, type AuditLog } from './queries'

const PAGE_SIZE = 25

const show = (value: unknown, nameOf: (id: string) => string | undefined): string => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return UUID.test(value) ? (nameOf(value) ?? value) : value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function DetailsDialog({ log, onClose }: { log: AuditLog | null; onClose: () => void }) {
  const before = log?.old_value ?? {}
  const after = log?.new_value ?? {}
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  const ids = [...Object.values(before), ...Object.values(after), log?.entity_id, log?.actor_user_id].filter(
    (value): value is string => typeof value === 'string' && UUID.test(value),
  )
  const { byId } = usePeople(ids)
  const nameOf = (id: string) => byId.get(id)?.name
  return (
    <Dialog open={log !== null} onClose={onClose} title={log ? actionLabel(log.action) : 'Details'}>
      {log && (
        <div className="stack">
          <dl className="facts">
            <dt>When</dt>
            <dd>{formatDateTime(log.created_at)}</dd>
            <dt>Who</dt>
            <dd>{log.actor_user_id ? (nameOf(log.actor_user_id) ?? '…') : 'System'}</dd>
            <dt>Record</dt>
            <dd>
              {entityLabel(log.entity_type)}
              {log.entity_id ? ` · ${nameOf(log.entity_id) ?? log.entity_id}` : ''}
            </dd>
          </dl>
          {keys.length === 0 ? (
            <p>No field details were recorded for this action.</p>
          ) : (
            <table className="table">
              <caption className="visually-hidden">What changed</caption>
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Before</th>
                  <th scope="col">After</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key}>
                    <th scope="row">{key.replace(/_/g, ' ')}</th>
                    <td>{log.old_value ? show(before[key], nameOf) : '—'}</td>
                    <td>{log.new_value ? show(after[key], nameOf) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Dialog>
  )
}

/** The Owner's raw audit trail: who did what, to which record, and when. Owner-only on the server. */
export function AuditLogsPage() {
  const [params, setParams] = useUrlParams({ action: '', type: '', actor: '', record: '', from: '', to: '', page: '1' })
  const page = pageNumber(params.page)
  const people = useVisibleUsers({ page: 1, page_size: 100 })
  const [detail, setDetail] = useState<AuditLog | null>(null)
  const recordIdValid = !params.record || UUID.test(params.record)
  const query = useAuditLogs({
    ...(params.action ? { action: params.action } : {}),
    ...(params.type ? { entity_type: params.type } : {}),
    ...(params.actor ? { actor_user_id: params.actor } : {}),
    ...(params.record && recordIdValid ? { entity_id: params.record } : {}),
    ...(params.from ? { start_date: params.from } : {}),
    ...(params.to ? { end_date: params.to } : {}),
    page,
    page_size: PAGE_SIZE,
  })
  const { nameOf } = usePeople((query.data?.items ?? []).flatMap((log) => [log.actor_user_id, log.entity_type === 'user' ? log.entity_id : null]))
  const filtered = Boolean(params.action || params.type || params.actor || params.record || params.from || params.to)

  const columns: Column<AuditLog>[] = [
    { key: 'when', header: 'When', primary: true, cell: (l) => formatDateTime(l.created_at) },
    { key: 'who', header: 'Who', cell: (l) => (l.actor_user_id ? nameOf(l.actor_user_id, '…') : 'System') },
    { key: 'what', header: 'What', cell: (l) => actionLabel(l.action) },
    {
      key: 'record',
      header: 'Record',
      cell: (l) => {
        const path = entityPath(l.entity_type, l.entity_id)
        const text = l.entity_type === 'user' && l.entity_id ? nameOf(l.entity_id, entityLabel(l.entity_type)) : entityLabel(l.entity_type)
        return path ? <Link to={path}>{text}</Link> : text
      },
    },
    {
      key: 'details',
      header: 'Details',
      cell: (l) => (
        <Button size="sm" variant="outline" onClick={() => setDetail(l)} aria-label={`Show details: ${actionLabel(l.action)}, ${formatDateTime(l.created_at)}`}>
          Details
        </Button>
      ),
    },
  ]

  return (
    <section>
      <PageHeader title="Audit trail" description="A permanent record of who changed what, and when. Entries cannot be edited or removed." />
      <div className="toolbar">
        <Input
          label="Action"
          list="audit-actions"
          placeholder="e.g. user.created"
          value={params.action}
          onChange={(event) => setParams({ action: event.target.value.trim() })}
        />
        <datalist id="audit-actions">
          {Object.entries(AUDIT_ACTIONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </datalist>
        <Select
          label="Record type"
          value={params.type}
          onChange={(event) => setParams({ type: event.target.value })}
          options={Object.entries(AUDIT_ENTITY_TYPES).map(([value, label]) => ({ value, label }))}
          placeholder="All records"
        />
        <Select
          label="Done by"
          value={params.actor}
          onChange={(event) => setParams({ actor: event.target.value })}
          options={(people.data?.items ?? []).map((person) => ({ value: person.id, label: personLabel(person) }))}
          placeholder="Anyone"
        />
        <Input label="From" type="date" value={params.from} onChange={(event) => setParams({ from: event.target.value })} />
        <Input label="To" type="date" value={params.to} min={params.from || undefined} onChange={(event) => setParams({ to: event.target.value })} />
        <Input
          label="Record id"
          value={params.record}
          placeholder="Paste a record id"
          error={recordIdValid ? undefined : 'An id looks like 3f2a…-…-…'}
          onChange={(event) => setParams({ record: event.target.value.trim() })}
        />
        {filtered && (
          <Button variant="ghost" onClick={() => setParams({ action: '', type: '', actor: '', record: '', from: '', to: '' })}>
            Clear filters
          </Button>
        )}
      </div>
      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<History size={24} />}
            title={filtered ? 'No entries match these filters' : 'Nothing has been recorded yet'}
            description={filtered ? 'Widen the dates or clear the filters.' : 'Changes to people, tasks, projects, permissions and service calls appear here.'}
          />
        }
      >
        {(data) => (
          <>
            <p aria-live="polite" style={{ marginBottom: 10 }}>
              {data.total} {data.total === 1 ? 'entry' : 'entries'}, newest first.
            </p>
            <RecordList rows={data.items} columns={columns} rowKey={(l) => l.id} caption="Audit trail" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(next) => setParams({ page: String(next) })} />
          </>
        )}
      </QueryBoundary>
      <DetailsDialog log={detail} onClose={() => setDetail(null)} />
    </section>
  )
}
