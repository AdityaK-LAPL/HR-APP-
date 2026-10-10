import { ArrowRightLeft, ShieldAlert, UserCheck, UserCog, UserX } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { useToast } from '@/components/feedback/toastContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/fields'
import { useAuth } from '@/features/auth/authContext'
import { personLabel, useUpdatePerson, useVisibleUsers, type Person } from '@/features/team/queries'
import { useChangeManager } from './queries'

/** Role, status and reporting-line controls for one person. Owner only; the server enforces it. */
export function OwnerPersonActions({ person }: { person: Person }) {
  const { user } = useAuth()
  const toast = useToast()
  const update = useUpdatePerson()
  const [dialog, setDialog] = useState<'role' | 'manager' | 'status' | null>(null)
  const isSelf = person.id === user?.id
  const isOwnerAccount = person.role === 'owner'
  const reports = useVisibleUsers({ manager_id: person.id, is_active: true, page: 1, page_size: 1 })
  const reportCount = reports.data?.total ?? 0

  return (
    <>
      {!isOwnerAccount && (
        <Button variant="outline" icon={<UserCog size={16} />} onClick={() => setDialog('role')}>
          Change role
        </Button>
      )}
      {!isOwnerAccount && (
        <Button variant="outline" icon={<ArrowRightLeft size={16} />} onClick={() => setDialog('manager')}>
          Change manager
        </Button>
      )}
      {!isSelf && !isOwnerAccount && (
        <Button
          variant={person.is_active ? 'outline' : 'primary'}
          icon={person.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
          onClick={() => setDialog('status')}
        >
          {person.is_active ? 'Deactivate' : 'Reactivate'}
        </Button>
      )}

      <Dialog open={dialog === 'role'} onClose={() => setDialog(null)} title={`Change role for ${person.name}`}>
        {dialog === 'role' && <RoleForm person={person} reportCount={reportCount} onClose={() => setDialog(null)} />}
      </Dialog>
      <ChangeManagerDialog person={person} open={dialog === 'manager'} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={dialog === 'status'}
        tone={person.is_active ? 'danger' : 'default'}
        title={person.is_active ? `Deactivate ${person.name}?` : `Reactivate ${person.name}?`}
        message={
          person.is_active
            ? `${person.name} will no longer be able to sign in. Their tasks, reports, attendance and service records are kept.${
                reportCount > 0
                  ? ` ${reportCount} ${reportCount === 1 ? 'person still reports' : 'people still report'} to them - move them to another manager from each person's page.`
                  : ''
              } Permissions already granted to them are not removed.`
            : `${person.name} will be able to sign in again with their current password.`
        }
        confirmLabel={person.is_active ? 'Deactivate' : 'Reactivate'}
        busy={update.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          update.mutate(
            { id: person.id, input: { is_active: !person.is_active } },
            {
              onSuccess: () => toast.success(person.is_active ? `${person.name} was deactivated.` : `${person.name} was reactivated.`),
              onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not change the status.'),
              onSettled: () => setDialog(null),
            },
          )
        }
      />
    </>
  )
}

function RoleForm({ person, reportCount, onClose }: { person: Person; reportCount: number; onClose: () => void }) {
  const toast = useToast()
  const update = useUpdatePerson()
  const [role, setRole] = useState<'manager' | 'employee'>(person.role === 'manager' ? 'manager' : 'employee')
  const [error, setError] = useState<string | null>(null)
  const demoting = person.role === 'manager' && role === 'employee'
  return (
    <div className="stack">
      {error && <Alert tone="error">{error}</Alert>}
      <Select
        label="Role"
        value={role}
        onChange={(event) => setRole(event.target.value as 'manager' | 'employee')}
        options={[
          { value: 'employee', label: 'Employee' },
          { value: 'manager', label: 'Manager' },
        ]}
        hint={role === 'manager' ? 'A manager sees their own team and projects, and can be given more under Permissions.' : 'An employee sees their own work only.'}
      />
      {demoting && (
        <Alert tone="warning">
          {reportCount > 0
            ? `${person.name} still has ${reportCount} ${reportCount === 1 ? 'person' : 'people'} reporting to them. Move them to another manager first, otherwise they will report to someone who is no longer a manager.`
            : `${person.name} will lose manager access to their team.`}
        </Alert>
      )}
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button
          icon={demoting ? <ShieldAlert size={16} /> : undefined}
          variant={demoting ? 'danger' : 'primary'}
          disabled={role === person.role}
          loading={update.isPending}
          onClick={() => {
            setError(null)
            update.mutate(
              { id: person.id, input: { role } },
              {
                onSuccess: () => {
                  toast.success(`${person.name} is now ${role === 'manager' ? 'a manager' : 'an employee'}.`)
                  onClose()
                },
                onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not change the role.'),
              },
            )
          }}
        >
          {demoting ? 'Make employee' : 'Change role'}
        </Button>
      </div>
    </div>
  )
}

type Reporter = Pick<Person, 'id' | 'name' | 'manager_id'>

/** Move someone (and everyone under them) to a different manager. Owner only. */
export function ChangeManagerDialog({ person, open, onClose }: { person: Reporter; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={`Change manager for ${person.name}`}>
      {open && <ManagerForm person={person} onClose={onClose} />}
    </Dialog>
  )
}

function ManagerForm({ person, onClose }: { person: Reporter; onClose: () => void }) {
  const toast = useToast()
  const change = useChangeManager()
  const people = useVisibleUsers({ is_active: true, page: 1, page_size: 100 })
  const [managerId, setManagerId] = useState(person.manager_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const options = (people.data?.items ?? [])
    .filter((candidate) => (candidate.role === 'manager' || candidate.role === 'owner') && candidate.id !== person.id)
    .map((candidate) => ({ value: candidate.id, label: personLabel(candidate) }))
  return (
    <div className="stack">
      {error && <Alert tone="error">{error}</Alert>}
      <Select
        label="Reports to"
        value={managerId}
        onChange={(event) => setManagerId(event.target.value)}
        placeholder="No manager"
        options={options}
        hint="Only managers (and the Owner) can be someone's manager. A change that would loop the reporting line is refused."
      />
      <Alert tone="info">
        Their manager decides their leave and sees their work. Anyone who reports to {person.name} moves with them.
      </Alert>
      <div className="form-actions">
        <Button variant="outline" onClick={onClose} disabled={change.isPending}>
          Cancel
        </Button>
        <Button
          disabled={managerId === (person.manager_id ?? '')}
          loading={change.isPending}
          onClick={() => {
            setError(null)
            change.mutate(
              { id: person.id, managerId: managerId || null },
              {
                onSuccess: () => {
                  toast.success('Reporting line updated.')
                  onClose()
                },
                onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not change the manager.'),
              },
            )
          }}
        >
          Save
        </Button>
      </div>
    </div>
  )
}
