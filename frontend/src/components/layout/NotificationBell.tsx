import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useUnreadCount } from '@/features/notifications/queries'

/** Header shortcut to the notifications page, with the unread count (hidden when there is none). */
export function NotificationBell() {
  const unread = useUnreadCount()
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications'
  return (
    <Link to="/notifications" className="icon-btn bell" aria-label={label}>
      <Bell size={20} aria-hidden="true" />
      {unread ? (
        <span className="bell-count" aria-hidden="true">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  )
}
