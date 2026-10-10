import { Bell, CheckCheck } from 'lucide-react'
import { ApiError } from '@/api/errors'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { useToast } from '@/components/feedback/toastContext'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { formatDateTime } from '@/lib/dates'
import { useUrlParams } from '@/lib/useUrlParams'
import { useMarkAllRead, useMarkRead, useNotifications, type Notification } from './queries'

const humanize = (type: string) => {
  const text = type.replace(/[._]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Free-form payloads are shown generically: a `message`/`title` if there is one, else simple key/value facts. */
function PayloadText({ payload }: { payload: Notification['payload'] }) {
  if (!payload) return null
  const message = [payload.message, payload.title, payload.body].find((value): value is string => typeof value === 'string')
  if (message) return <p className="prose">{message}</p>
  const facts = Object.entries(payload).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
  if (facts.length === 0) return null
  return (
    <p className="meta-line">
      {facts.slice(0, 4).map(([key, value]) => (
        <span key={key}>
          {humanize(key)}: {String(value)}
        </span>
      ))}
    </p>
  )
}

export function NotificationsPage() {
  const toast = useToast()
  const [params, setParams] = useUrlParams({ view: 'all' })
  const unreadOnly = params.view === 'unread'
  const query = useNotifications(unreadOnly)
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()

  return (
    <section>
      <PageHeader
        title="Notifications"
        description="Updates addressed to you."
        actions={
          <Button
            variant="outline"
            icon={<CheckCheck size={16} />}
            loading={markAll.isPending}
            onClick={() =>
              markAll.mutate(undefined, {
                onSuccess: () => toast.success('All notifications marked as read.'),
                onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not mark them as read.'),
              })
            }
          >
            Mark all as read
          </Button>
        }
      />
      <SegmentedControl
        label="Notification filter"
        value={unreadOnly ? 'unread' : 'all'}
        onChange={(view) => setParams({ view })}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread' },
        ]}
      />
      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<Bell size={24} />}
            title={unreadOnly ? 'You are all caught up' : 'No notifications yet'}
            description="Updates about your work will appear here."
          />
        }
      >
        {(data) => (
          <ul className="card-list" aria-label="Notifications">
            {data.items.map((item) => (
              <li key={item.id} className="record-card glass-card" style={{ opacity: item.read_at ? 0.75 : 1 }}>
                <div className="page-header-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="record-card-title">
                      {item.read_at ? null : <span className="badge badge-info">New</span>} {humanize(item.type)}
                    </div>
                    <time className="meta-line" dateTime={item.created_at}>
                      {formatDateTime(item.created_at)}
                    </time>
                    <PayloadText payload={item.payload} />
                  </div>
                  {!item.read_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={markRead.isPending && markRead.variables === item.id}
                      onClick={() => markRead.mutate(item.id)}
                      aria-label={`Mark “${humanize(item.type)}” as read`}
                    >
                      Mark as read
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
    </section>
  )
}
