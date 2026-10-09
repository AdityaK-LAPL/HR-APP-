import { LogOut, Menu } from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { mobileBarForRole, navGroupsForRole, routeLabel } from '@/app/route-config'
import { useAuth } from '@/features/auth/authContext'
import { Dialog } from '@/components/ui/Dialog'

/** Bottom tab bar (< 1024px): up to four primary tabs plus a "More" sheet with everything else. */
export function MobileNav() {
  const { user, logout } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  if (!user) return null

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Tab bar">
        {mobileBarForRole(user.role).map((route) => (
          <NavLink
            key={route.path}
            to={`/${route.path}`}
            className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}
          >
            <route.icon size={20} aria-hidden="true" />
            {route.title === 'Dashboard' ? 'Home' : route.title.split(' ')[0]}
          </NavLink>
        ))}
        <button type="button" className="mobile-nav-item" onClick={() => setMoreOpen(true)}>
          <Menu size={20} aria-hidden="true" />
          More
        </button>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu">
        <div className="mobile-more-sheet">
          {navGroupsForRole(user.role).map(({ section, routes }) => (
            <div key={section} style={{ marginBottom: 12 }}>
              <div className="nav-section-label">{section}</div>
              {routes.map((route) => (
                <NavLink
                  key={route.path}
                  to={`/${route.path}`}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  onClick={() => setMoreOpen(false)}
                >
                  <route.icon size={18} aria-hidden="true" />
                  {routeLabel(route, user.role)}
                </NavLink>
              ))}
            </div>
          ))}
          <button
            type="button"
            className="nav-link"
            style={{ width: '100%' }}
            onClick={() => {
              setMoreOpen(false)
              void logout()
            }}
          >
            <LogOut size={18} aria-hidden="true" /> Sign out
          </button>
        </div>
      </Dialog>
    </>
  )
}
