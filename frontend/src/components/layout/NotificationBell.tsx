import { Bell, CheckCheck } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { useToast } from '@/components/feedback/toastContext'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/authContext'
import { ago, messageOf, targetOf, titleOf } from '@/features/notifications/describe'
import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount, type Notification } from '@/features/notifications/queries'
import { formatDateTime } from '@/lib/dates'

const PREVIEW = 8

/**
 * The notification centre: a bell with the unread count that opens a panel with the latest
 * notifications. Opening one marks it read and takes you to the record it names (when it names
 * one) or to its details. Polled for the count; the list loads only while the panel is open.
 */
export function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const unread = useUnreadCount()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const list = useNotifications(false, open)
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications'

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (notification: Notification) => {
    if (!notification.read_at) markRead.mutate(notification.id, { onError: () => toast.error('Could not mark the notification as read.') })
    setOpen(false)
    const target = user ? targetOf(notification, user.role) : null
    void navigate(target ? target.to : `/notifications?open=${notification.id}`)
  }

  return (
    <div className="menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn bell"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={20} aria-hidden="true" />
        {unread ? (
          <span className="bell-count" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      {open && (
        <div id={panelId} className="menu-panel notif-panel" role="region" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            <Button
              size="sm"
              variant="ghost"
              icon={<CheckCheck size={14} />}
              disabled={!unread}
              loading={markAll.isPending}
              onClick={() => markAll.mutate(undefined, { onError: () => toast.error('Could not mark them as read.') })}
            >
              Mark all read
            </Button>
          </div>
          <QueryBoundary query={list} isEmpty={(data) => data.items.length === 0} empty={<p className="notif-empty">You have no notifications.</p>}>
            {(data) => (
              <ul className="notif-list">
                {data.items.slice(0, PREVIEW).map((notification) => {
                  const message = messageOf(notification)
                  return (
                    <li key={notification.id}>
                      <button type="button" className={`notif-item${notification.read_at ? '' : ' unread'}`} onClick={() => choose(notification)}>
                        <span className="notif-title">
                          {notification.read_at ? null : <span className="badge badge-info">New</span>} {titleOf(notification)}
                        </span>
                        {message && <span className="notif-message clamp-2">{message}</span>}
                        <time className="notif-time" dateTime={notification.created_at}>
                          {ago(notification.created_at) ?? formatDateTime(notification.created_at)}
                        </time>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </QueryBoundary>
          <div className="notif-foot">
            <Link to="/notifications" onClick={() => setOpen(false)}>
              See all notifications{list.data && list.data.total > PREVIEW ? ` (${list.data.total})` : ''}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
