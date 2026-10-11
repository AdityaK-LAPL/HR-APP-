import { Bell, CheckCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { useToast } from '@/components/feedback/toastContext'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useAuth } from '@/features/auth/authContext'
import { formatDateTime } from '@/lib/dates'
import { useUrlParams } from '@/lib/useUrlParams'
import { ago, factsOf, messageOf, targetOf, titleOf } from './describe'
import { useMarkAllRead, useMarkRead, useNotifications, type Notification } from './queries'

function Details({ notification, onClose }: { notification: Notification | null; onClose: () => void }) {
  const { user } = useAuth()
  const markRead = useMarkRead()
  // Reading the details is what "read" means: mark each notification once, when it is opened. This
  // component stays mounted between openings, so remember WHICH one was marked, not "something was".
  const marked = useRef<string | null>(null)
  const id = notification?.id
  const unread = notification ? !notification.read_at : false
  const { mutate } = markRead
  useEffect(() => {
    if (id && unread && marked.current !== id) {
      marked.current = id
      mutate(id)
    }
  }, [id, unread, mutate])
  const target = notification && user ? targetOf(notification, user.role) : null
  const message = notification ? messageOf(notification) : null
  const facts = notification ? factsOf(notification) : []
  return (
    <Dialog open={notification !== null} onClose={onClose} title={notification ? titleOf(notification) : 'Notification'}>
      {notification && (
        <div className="stack">
          <p className="meta-line">
            <time dateTime={notification.created_at}>{formatDateTime(notification.created_at)}</time>
            {notification.read_at ? <span>· read {formatDateTime(notification.read_at)}</span> : <span className="badge badge-info">New</span>}
          </p>
          {message && <p className="prose">{message}</p>}
          {facts.length > 0 && (
            <dl className="facts">
              {facts.map((fact) => (
                <div key={fact.key} style={{ display: 'contents' }}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {!message && facts.length === 0 && <p>This notification carries no further details.</p>}
          {target && (
            <p>
              <Link className="btn btn-primary" to={target.to} onClick={onClose}>
                {target.label}
              </Link>
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}

/** Every notification addressed to the signed-in person, newest first, with read / unread state. */
export function NotificationsPage() {
  const toast = useToast()
  const [params, setParams] = useUrlParams({ view: 'all', open: '' })
  const unreadOnly = params.view === 'unread'
  const query = useNotifications(unreadOnly)
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  // Keep a copy of the opened notification so it stays open in its details even after reading it
  // takes it out of the "Unread" view.
  const [snapshot, setSnapshot] = useState<Notification | null>(null)
  const found = params.open ? query.data?.items.find((item) => item.id === params.open) : undefined
  if (found && snapshot !== found) setSnapshot(found) // React's "adjust state while rendering" pattern
  const opened = params.open && snapshot?.id === params.open ? snapshot : null

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
          <>
            <p aria-live="polite" style={{ marginBottom: 10 }}>
              {data.total} {data.total === 1 ? 'notification' : 'notifications'}
              {unreadOnly ? ' unread' : ''}, newest first.
            </p>
            <ul className="card-list" aria-label="Notifications">
              {data.items.map((item) => {
                const message = messageOf(item)
                const facts = factsOf(item)
                return (
                  <li key={item.id} className="record-card glass-card" style={{ opacity: item.read_at ? 0.8 : 1 }}>
                    <div className="page-header-row">
                      <div style={{ minWidth: 0 }}>
                        <div className="record-card-title">
                          {item.read_at ? null : <span className="badge badge-info">New</span>}{' '}
                          <button type="button" className="link-btn" onClick={() => setParams({ open: item.id })}>
                            {titleOf(item)}
                          </button>
                        </div>
                        <time className="meta-line" dateTime={item.created_at}>
                          {ago(item.created_at) ?? formatDateTime(item.created_at)}
                        </time>
                        {message ? (
                          <p className="prose clamp-2">{message}</p>
                        ) : facts.length > 0 ? (
                          <p className="meta-line">
                            {facts.slice(0, 4).map((fact) => (
                              <span key={fact.key}>
                                {fact.label}: {fact.value}
                              </span>
                            ))}
                          </p>
                        ) : null}
                      </div>
                      {!item.read_at && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={markRead.isPending && markRead.variables === item.id}
                          onClick={() => markRead.mutate(item.id)}
                          aria-label={`Mark “${titleOf(item)}” as read`}
                        >
                          Mark as read
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </QueryBoundary>
      <Details notification={opened} onClose={() => setParams({ open: '' })} />
    </section>
  )
}
