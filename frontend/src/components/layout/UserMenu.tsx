import { ChevronDown, KeyRound, LogOut, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null

  return (
    <div className="menu" ref={rootRef}>
      <button
        type="button"
        className="user-chip btn-ghost"
        style={{ minHeight: 44, padding: '0 8px', borderRadius: 'var(--radius-sm)' }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="user-meta">
          <strong>{user.name}</strong>
          <span>{user.role}</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          <div className="menu-heading">
            {user.employee_code}
            {user.designation ? ` · ${user.designation}` : ''}
          </div>
          <Link to="/profile" role="menuitem" className="menu-item" onClick={() => setOpen(false)}>
            <UserRound size={16} aria-hidden="true" /> My profile
          </Link>
          <Link to="/change-password" role="menuitem" className="menu-item" onClick={() => setOpen(false)}>
            <KeyRound size={16} aria-hidden="true" /> Change password
          </Link>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false)
              void logout()
            }}
          >
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
