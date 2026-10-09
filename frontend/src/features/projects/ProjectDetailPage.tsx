import { useParams } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { BackLink } from '@/components/ui/BackLink'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AttachmentsPanel } from '@/features/attachments/AttachmentsPanel'
import { usePeople } from '@/features/people/usePeople'
import { formatDate } from '@/lib/dates'
import { PROJECT_STATUS } from '@/lib/labels'
import { useProject, useProjectMembers } from './queries'

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const project = useProject(id)
  const members = useProjectMembers(id)
  const activeMembers = (members.data ?? []).filter((member) => member.is_active)
  const { nameOf } = usePeople([project.data?.owning_manager_id, ...activeMembers.map((m) => m.user_id)])

  return (
    <QueryBoundary query={project}>
      {(data) => (
        <section>
          <PageHeader
            back={<BackLink to="/projects">All projects</BackLink>}
            title={data.name}
            description={data.description ?? undefined}
          />
          <Section title="Details">
            <dl className="facts">
              <dt>Status</dt>
              <dd>
                <StatusBadge table={PROJECT_STATUS} value={data.status} />
                {!data.is_active && ' (archived)'}
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
          <Section title="Team">
            <QueryBoundary
              query={members}
              isEmpty={() => activeMembers.length === 0}
              empty={<p>No members listed.</p>}
            >
              {() => (
                <ul style={{ listStyle: 'none' }} className="stack">
                  {activeMembers.map((member) => (
                    <li key={member.id}>
                      <strong>{nameOf(member.user_id, '…')}</strong>
                      {member.role_in_project ? ` · ${member.role_in_project}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </QueryBoundary>
          </Section>
          <AttachmentsPanel entityType="project" entityId={data.id} title="Project files" />
        </section>
      )}
    </QueryBoundary>
  )
}
