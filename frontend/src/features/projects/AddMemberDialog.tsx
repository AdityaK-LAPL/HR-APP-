import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/fields'
import { useTeamOptions } from '@/features/team/queries'
import { useAddProjectMember } from './queries'

/** Allocate someone from the manager's team to the project. */
export function AddMemberDialog({
  projectId,
  currentMemberIds,
  open,
  onClose,
}: {
  projectId: string
  currentMemberIds: ReadonlySet<string>
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Add to project">
      <AddMemberForm projectId={projectId} currentMemberIds={currentMemberIds} onClose={onClose} />
    </Dialog>
  )
}

function AddMemberForm({
  projectId,
  currentMemberIds,
  onClose,
}: {
  projectId: string
  currentMemberIds: ReadonlySet<string>
  onClose: () => void
}) {
  const toast = useToast()
  const team = useTeamOptions()
  const add = useAddProjectMember(projectId)
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState('')
  const [error, setError] = useState<string | null>(null)

  const options = team.options.filter((option) => !currentMemberIds.has(option.value))

  return (
    <div className="stack">
      {error && <Alert tone="error">{error}</Alert>}
      <Select
        label="Person"
        required
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
        placeholder={team.isLoading ? 'Loading people…' : options.length ? 'Choose a person' : 'Everyone is already on this project'}
        options={options}
      />
      <Input label="Role on the project" hint="Optional, e.g. Site engineer." value={role} onChange={(event) => setRole(event.target.value)} />
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={add.isPending}>
          Cancel
        </Button>
        <Button
          disabled={!userId}
          loading={add.isPending}
          onClick={() => {
            setError(null)
            add.mutate(
              { user_id: userId, role_in_project: role.trim() || null },
              {
                onSuccess: () => {
                  toast.success('Added to the project.')
                  onClose()
                },
                onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not add this person.'),
              },
            )
          }}
        >
          Add to project
        </Button>
      </div>
    </div>
  )
}
