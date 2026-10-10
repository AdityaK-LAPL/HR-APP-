import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/fields'
import { useAssignableUsers } from '@/features/team/queries'
import { useUpdateTask, type Task } from './queries'

/** Hand a task to someone else. The server records the change in the task history. */
export function ReassignDialog({ task, open, onClose }: { task: Task; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Reassign task">
      <ReassignForm task={task} onClose={onClose} />
    </Dialog>
  )
}

function ReassignForm({ task, onClose }: { task: Task; onClose: () => void }) {
  const toast = useToast()
  const update = useUpdateTask()
  const assignable = useAssignableUsers()
  const [target, setTarget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const options = assignable.options.filter((option) => option.value !== task.assigned_to)

  return (
    <div className="stack">
      {error && <Alert tone="error">{error}</Alert>}
      <p>“{task.title}” will move to the person you choose. The change is recorded in the task history.</p>
      <Select
        label="Reassign to"
        required
        value={target}
        onChange={(event) => setTarget(event.target.value)}
        placeholder={assignable.isLoading ? 'Loading people…' : 'Choose a person'}
        options={options}
      />
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button
          disabled={!target}
          loading={update.isPending}
          onClick={() => {
            setError(null)
            update.mutate(
              { id: task.id, patch: { assigned_to: target } },
              {
                onSuccess: () => {
                  toast.success('Task reassigned.')
                  onClose()
                },
                onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not reassign the task.'),
              },
            )
          }}
        >
          Reassign
        </Button>
      </div>
    </div>
  )
}
