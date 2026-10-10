import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/fields'
import { useAuth } from '@/features/auth/authContext'
import { personLabel, useSubtree } from '@/features/team/queries'
import { useAssignEmployee } from './queries'

/** Put someone from the manager's team on a service call. */
export function AssignEmployeeDialog({
  callId,
  assignedIds,
  open,
  onClose,
}: {
  callId: string
  assignedIds: ReadonlySet<string>
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Assign to this call">
      <AssignForm callId={callId} assignedIds={assignedIds} onClose={onClose} />
    </Dialog>
  )
}

function AssignForm({ callId, assignedIds, onClose }: { callId: string; assignedIds: ReadonlySet<string>; onClose: () => void }) {
  const toast = useToast()
  const { user } = useAuth()
  const subtree = useSubtree()
  const assign = useAssignEmployee(callId)
  const [employeeId, setEmployeeId] = useState('')
  const [role, setRole] = useState('')
  const [error, setError] = useState<string | null>(null)

  const options = [
    ...(user && !assignedIds.has(user.id) ? [{ value: user.id, label: personLabel(user, ' (you)') }] : []),
    ...subtree.people
      .filter((person) => person.is_active && !assignedIds.has(person.id))
      .map((person) => ({ value: person.id, label: personLabel(person) })),
  ]

  return (
    <div className="stack">
      {error && <Alert tone="error">{error}</Alert>}
      <Select
        label="Person"
        required
        value={employeeId}
        onChange={(event) => setEmployeeId(event.target.value)}
        placeholder={subtree.isLoading ? 'Loading your team…' : options.length ? 'Choose a person' : 'Everyone is already assigned'}
        options={options}
      />
      <Input label="Role on this call" hint="Optional, e.g. Lead technician." value={role} onChange={(event) => setRole(event.target.value)} />
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={assign.isPending}>
          Cancel
        </Button>
        <Button
          disabled={!employeeId}
          loading={assign.isPending}
          onClick={() => {
            setError(null)
            assign.mutate(
              { employee_id: employeeId, role_in_call: role.trim() || null },
              {
                onSuccess: () => {
                  toast.success('Assigned to the call.')
                  onClose()
                },
                onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not assign this person.'),
              },
            )
          }}
        >
          Assign
        </Button>
      </div>
    </div>
  )
}
