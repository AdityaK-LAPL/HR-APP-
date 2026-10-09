import { useParams } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { AttachmentsPanel } from '@/features/attachments/AttachmentsPanel'
import { useProject } from '@/features/projects/queries'
import { formatDate, formatDateTime } from '@/lib/dates'
import { useEod } from './queries'

function Block({ title, text }: { title: string; text: string | null }) {
  if (!text) return null
  return (
    <Section title={title}>
      <p className="prose">{text}</p>
    </Section>
  )
}

export function EodDetailPage() {
  const { id = '' } = useParams()
  const query = useEod(id)
  const project = useProject(query.data?.project_id)
  return (
    <QueryBoundary query={query}>
      {(report) => (
        <section>
          <PageHeader
            back={<BackLink to="/eod">All reports</BackLink>}
            title={`EOD report · ${formatDate(report.report_date)}`}
            description={`Submitted ${formatDateTime(report.submitted_at)}${project.data ? ` · ${project.data.name}` : ''}`}
          />
          <Alert tone="info">Submitted reports are a permanent record and cannot be edited.</Alert>
          <div style={{ height: 16 }} />
          <Block title="Work completed" text={report.work_completed} />
          <Block title="Work remaining" text={report.work_remaining} />
          <Block title="Issues or blockers" text={report.issues} />
          <Block title="Notes" text={report.notes} />
          <AttachmentsPanel entityType="eod_report" entityId={report.id} canUpload title="Report files" />
        </section>
      )}
    </QueryBoundary>
  )
}
