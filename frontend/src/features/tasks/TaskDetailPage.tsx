import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AttachmentsPanel } from '@/features/attachments/AttachmentsPanel'
import { useCompanyToday } from '@/features/config/useCompanyToday'
import { usePeople } from '@/features/people/usePeople'
import { useProject } from '@/features/projects/queries'
import { formatDate, formatDateTime } from '@/lib/dates'
import { PRIORITY, TASK_STATUS, optionsOf } from '@/lib/labels'
import { isOverdue } from './logic'
import { useTask, useTaskHistory, useUpdateTaskStatus, type Task, type TaskStatus } from './queries'

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  assigned_to: 'Assignee',
  title: 'Title',
  description: 'Description',
  due_date: 'Due date',
  task_date: 'Task date',
  project_id: 'Project',
}

function StatusControl({ task }: { task: Task }) {
  const toast = useToast()
  const update = useUpdateTaskStatus()
  const [selected, setSelected] = useState<TaskStatus>(task.status)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = selected !== task.status
  // Finishing or cancelling work is hard to undo mentally, so ask first.
  const needsConfirm = selected === 'completed' || selected === 'cancelled'

  const save = () => {
    setError(null)
    update.mutate(
      { id: task.id, status: selected },
      {
        onSuccess: () => {
          toast.success(`Status changed to “${TASK_STATUS[selected].label}”.`)
          setConfirming(false)
        },
        onError: (e) => {
          setConfirming(false)
          setError(e instanceof ApiError ? e.message : 'Could not update the status.')
        },
      },
    )
  }

  return (
    <div className="stack">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <Select
          label="Change status"
          value={selected}
          onChange={(event) => setSelected(event.target.value as TaskStatus)}
          options={optionsOf(TASK_STATUS)}
        />
        <Button
          disabled={!dirty}
          loading={update.isPending && !confirming}
          onClick={() => (needsConfirm ? setConfirming(true) : save())}
        >
          Save status
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={selected === 'completed' ? 'Mark task as completed?' : 'Cancel this task?'}
        message={`“${task.title}” will be marked ${TASK_STATUS[selected].label.toLowerCase()}. You can change the status again later.`}
        confirmLabel={selected === 'completed' ? 'Mark completed' : 'Cancel task'}
        tone={selected === 'cancelled' ? 'danger' : 'default'}
        busy={update.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={save}
      />
    </div>
  )
}

function History({ taskId }: { taskId: string }) {
  const query = useTaskHistory(taskId)
  const { nameOf } = usePeople((query.data ?? []).map((entry) => entry.changed_by))
  return (
    <Section title="History">
      <QueryBoundary query={query} isEmpty={(rows) => rows.length === 0} empty={<p>No changes recorded.</p>}>
        {(rows) => (
          <ol className="timeline">
            {rows.map((entry) => (
              <li key={entry.id}>
                <time dateTime={entry.changed_at}>{formatDateTime(entry.changed_at)}</time>
                <strong>{nameOf(entry.changed_by, '…')}</strong> changed{' '}
                {FIELD_LABELS[entry.field_changed] ?? entry.field_changed}
                {entry.old_value !== null || entry.new_value !== null ? (
                  <>
                    {' '}
                    from <em>{entry.old_value ?? 'empty'}</em> to <em>{entry.new_value ?? 'empty'}</em>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </QueryBoundary>
    </Section>
  )
}

export function TaskDetailPage() {
  const { id = '' } = useParams()
  const today = useCompanyToday()
  const task = useTask(id)
  const project = useProject(task.data?.project_id)
  const { nameOf } = usePeople([task.data?.assigned_by])

  return (
    <QueryBoundary query={task}>
      {(data) => (
        <section>
          <PageHeader
            back={<BackLink to="/tasks">All tasks</BackLink>}
            title={data.title}
            description={data.description ?? undefined}
          />
          <Section title="Details">
            <dl className="facts">
              <dt>Status</dt>
              <dd>
                <StatusBadge table={TASK_STATUS} value={data.status} />
              </dd>
              <dt>Priority</dt>
              <dd>
                <StatusBadge table={PRIORITY} value={data.priority} />
              </dd>
              <dt>Task date</dt>
              <dd>{formatDate(data.task_date) || '—'}</dd>
              <dt>Due</dt>
              <dd>
                {formatDate(data.due_date) || '—'}
                {isOverdue(data, today) && (
                  <>
                    {' '}
                    <span className="badge badge-danger">Overdue</span>
                  </>
                )}
              </dd>
              <dt>Assigned by</dt>
              <dd>{nameOf(data.assigned_by, '…')}</dd>
              <dt>Project</dt>
              <dd>
                {!data.project_id ? (
                  'None'
                ) : project.data ? (
                  <Link to={`/projects/${project.data.id}`}>{project.data.name}</Link>
                ) : project.isPending ? (
                  '…'
                ) : (
                  'Not listed in your projects'
                )}
              </dd>
              <dt>Last updated</dt>
              <dd>{formatDateTime(data.updated_at)}</dd>
            </dl>
          </Section>
          <Section title="Update">
            <StatusControl key={`${data.id}-${data.status}`} task={data} />
          </Section>
          <History taskId={data.id} />
          <AttachmentsPanel entityType="task" entityId={data.id} canUpload title="Task files" />
        </section>
      )}
    </QueryBoundary>
  )
}
