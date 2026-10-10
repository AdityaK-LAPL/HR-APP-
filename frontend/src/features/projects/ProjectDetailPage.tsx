import { Archive, ArchiveRestore, Pencil, Plus, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { useToast } from '@/components/feedback/toastContext'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AttachmentsPanel } from '@/features/attachments/AttachmentsPanel'
import { useAuth } from '@/features/auth/authContext'
import { useCan } from '@/features/permissions/usePermissions'
import { usePeople } from '@/features/people/usePeople'
import { formatDate } from '@/lib/dates'
import { PROJECT_STATUS } from '@/lib/labels'
import { AddMemberDialog } from './AddMemberDialog'
import { ProjectFormDialog } from './ProjectFormDialog'
import { useProject, useProjectMembers, useRemoveProjectMember, useUpdateProject, type ProjectMember } from './queries'

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const project = useProject(id)
  const members = useProjectMembers(id)
  const activeMembers = (members.data ?? []).filter((member) => member.is_active)
  const { nameOf } = usePeople([project.data?.owning_manager_id, ...activeMembers.map((m) => m.user_id)])
  const { user } = useAuth()
  const can = useCan()
  const toast = useToast()
  const archive = useUpdateProject()
  const removeMember = useRemoveProjectMember(id)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [toRemove, setToRemove] = useState<ProjectMember | null>(null)

  return (
    <QueryBoundary query={project}>
      {(data) => {
        // Hints from facts on the record + the caller's own grants; the server decides.
        const isManager = user?.role === 'manager'
        const isOwner = user?.role === 'owner'
        const ownsProject = isManager && data.owning_manager_id === user?.id
        const scope = { type: 'project', id: data.id } as const
        const canEdit = isOwner || (isManager && data.is_active && (ownsProject || can('modify_project', scope)))
        const canArchive = data.is_active && (isOwner || (isManager && can('delete_archive_project', scope)))
        const canRestore = isOwner && !data.is_active
        const canMembers = data.is_active && (isOwner || (isManager && (ownsProject || can('assign_employees_to_project', scope))))
        return (
        <section>
          <PageHeader
            back={<BackLink to="/projects">All projects</BackLink>}
            title={data.name}
            description={data.description ?? undefined}
            actions={
              canEdit || canArchive || canRestore ? (
                <>
                  {canEdit && (
                    <Button variant="outline" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>
                      Edit project
                    </Button>
                  )}
                  {canArchive && (
                    <Button variant="outline" icon={<Archive size={16} />} onClick={() => setArchiving(true)}>
                      Archive
                    </Button>
                  )}
                  {canRestore && (
                    <Button
                      variant="outline"
                      icon={<ArchiveRestore size={16} />}
                      loading={archive.isPending}
                      onClick={() =>
                        archive.mutate(
                          { id: data.id, patch: { is_active: true } },
                          {
                            onSuccess: () => toast.success('Project restored.'),
                            onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not restore the project.'),
                          },
                        )
                      }
                    >
                      Restore
                    </Button>
                  )}
                </>
              ) : undefined
            }
          />
          <Section title="Details">
            <dl className="facts">
              <dt>Status</dt>
              <dd>
                <StatusBadge table={PROJECT_STATUS} value={data.status} />
                {!data.is_active && <> <span className="badge badge-neutral">Archived</span></>}
              </dd>
              <dt>Managed by</dt>
              <dd>{nameOf(data.owning_manager_id, '…')}</dd>
              <dt>Starts</dt>
              <dd>{formatDate(data.start_date) || '—'}</dd>
              <dt>Expected end</dt>
              <dd>{formatDate(data.expected_end_date) || '—'}</dd>
              {data.actual_end_date && (
                <>
                  <dt>Finished</dt>
                  <dd>{formatDate(data.actual_end_date)}</dd>
                </>
              )}
            </dl>
          </Section>
          <Section
            title="Team"
            action={
              canMembers ? (
                <Button size="sm" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
                  Add person
                </Button>
              ) : undefined
            }
          >
            <QueryBoundary
              query={members}
              isEmpty={() => activeMembers.length === 0}
              empty={<p>No members listed.</p>}
            >
              {() => (
                <ul style={{ listStyle: 'none' }} className="stack">
                  {activeMembers.map((member) => (
                    <li key={member.id} className="meta-line" style={{ justifyContent: 'space-between' }}>
                      <span>
                        <strong>{nameOf(member.user_id, '…')}</strong>
                        {member.role_in_project ? ` · ${member.role_in_project}` : ''}
                      </span>
                      {canMembers && (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<UserMinus size={14} />}
                          onClick={() => setToRemove(member)}
                          aria-label={`Remove ${nameOf(member.user_id, 'person')} from the project`}
                        >
                          Remove
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </QueryBoundary>
          </Section>
          <AttachmentsPanel entityType="project" entityId={data.id} canUpload={canEdit} title="Project files" />
          {canEdit && <ProjectFormDialog open={editing} onClose={() => setEditing(false)} project={data} />}
          {canMembers && (
            <AddMemberDialog
              projectId={data.id}
              currentMemberIds={new Set(activeMembers.map((member) => member.user_id))}
              open={adding}
              onClose={() => setAdding(false)}
            />
          )}
          <ConfirmDialog
            open={archiving}
            tone="danger"
            title="Archive this project?"
            message={`“${data.name}” will be marked as archived.`}
            confirmLabel="Archive project"
            busy={archive.isPending}
            onCancel={() => setArchiving(false)}
            onConfirm={() =>
              archive.mutate(
                { id: data.id, patch: { is_active: false } },
                {
                  onSuccess: () => toast.success('Project archived.'),
                  onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not archive the project.'),
                  onSettled: () => setArchiving(false),
                },
              )
            }
          />
          <ConfirmDialog
            open={toRemove !== null}
            tone="danger"
            title="Remove from project?"
            message={toRemove ? `${nameOf(toRemove.user_id, 'This person')} will no longer be a member of “${data.name}”.` : ''}
            confirmLabel="Remove"
            busy={removeMember.isPending}
            onCancel={() => setToRemove(null)}
            onConfirm={() => {
              if (!toRemove) return
              removeMember.mutate(toRemove.user_id, {
                onSuccess: () => toast.success('Removed from the project.'),
                onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove this person.'),
                onSettled: () => setToRemove(null),
              })
            }}
          />
        </section>
        )
      }}
    </QueryBoundary>
  )
}
