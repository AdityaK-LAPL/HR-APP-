import { NavLink } from 'react-router-dom'
import { navGroupsForRole, routeLabel } from '@/app/route-config'
import { useAuth } from '@/features/auth/authContext'
import { useCan } from '@/features/permissions/usePermissions'

/** Desktop navigation (>= 1024px). Items come from the route config for the signed-in role. */
export function Sidebar() {
  const { user } = useAuth()
  const can = useCan()
  if (!user) return null
  return (
    <aside className="desktop-sidebar">
      <div className="sidebar-brand">
        <img src="/pwa-icon.svg" alt="" />
        <span>OpsFlow</span>
      </div>
      <nav className="sidebar-nav" aria-label="Main menu">
        {navGroupsForRole(user.role, can).map(({ section, routes }) => (
          <div key={section}>
            <div className="nav-section-label">{section}</div>
            {routes.map((route) => (
              <NavLink
                key={route.path}
                to={`/${route.path}`}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                <route.icon size={18} aria-hidden="true" />
                {routeLabel(route, user.role)}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
