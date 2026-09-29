import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  CheckSquare,
  Clock,
  CalendarDays,
  FileText,
  Briefcase,
  Wrench,
  Users,
  Cpu,
  BarChart3,
  ShieldCheck,
  History,
  Building2,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

export const DesktopSidebar: React.FC = () => {
  const { role } = useAuth();

  // Navigation schema per role
  const getNavItems = (): { section: string; items: NavItem[] }[] => {
    if (role === 'owner') {
      return [
        {
          section: 'Core Management',
          items: [
            { to: '/dashboard', label: 'Company Overview', icon: <LayoutDashboard size={18} /> },
            { to: '/users', label: 'Employees & Hierarchy', icon: <Users size={18} /> },
            { to: '/tasks', label: 'Company Tasks', icon: <CheckSquare size={18} /> },
            { to: '/projects', label: 'Projects', icon: <Briefcase size={18} /> },
            { to: '/leaves', label: 'Leave Requests', icon: <CalendarDays size={18} /> },
            { to: '/attendance', label: 'Attendance Records', icon: <Clock size={18} /> },
            { to: '/eod', label: 'EOD Submissions', icon: <FileText size={18} /> },
          ],
        },
        {
          section: 'Service Operations',
          items: [
            { to: '/customers', label: 'Customers', icon: <Building2 size={18} /> },
            { to: '/machines', label: 'Machine Fleet', icon: <Cpu size={18} /> },
            { to: '/service', label: 'Service Calls', icon: <Wrench size={18} /> },
            { to: '/calendar', label: 'Team Calendar', icon: <CalendarDays size={18} /> },
          ],
        },
        {
          section: 'Governance & Audits',
          items: [
            { to: '/reports', label: 'Reports & Analytics', icon: <BarChart3 size={18} /> },
            { to: '/permissions', label: 'Permissions Matrix', icon: <ShieldCheck size={18} /> },
            { to: '/audit-logs', label: 'Audit Trail', icon: <History size={18} /> },
          ],
        },
      ];
    }

    if (role === 'manager') {
      return [
        {
          section: 'Team Operations',
          items: [
            { to: '/dashboard', label: 'Manager Dashboard', icon: <LayoutDashboard size={18} /> },
            { to: '/tasks', label: 'Team & Self Tasks', icon: <CheckSquare size={18} /> },
            { to: '/leaves', label: 'Leave Approvals', icon: <CalendarDays size={18} /> },
            { to: '/eod', label: 'EOD Review', icon: <FileText size={18} /> },
            { to: '/attendance', label: 'Team Attendance', icon: <Clock size={18} /> },
            { to: '/projects', label: 'Projects', icon: <Briefcase size={18} /> },
          ],
        },
        {
          section: 'Service Management',
          items: [
            { to: '/customers', label: 'Customers', icon: <Building2 size={18} /> },
            { to: '/machines', label: 'Machines', icon: <Cpu size={18} /> },
            { to: '/service', label: 'Service Calls', icon: <Wrench size={18} /> },
            { to: '/calendar', label: 'Team Calendar', icon: <CalendarDays size={18} /> },
            { to: '/reports', label: 'Team Reports', icon: <BarChart3 size={18} /> },
          ],
        },
      ];
    }

    // Default: Employee Navigation
    return [
      {
        section: 'My Workspace',
        items: [
          { to: '/dashboard', label: 'My Dashboard', icon: <LayoutDashboard size={18} /> },
          { to: '/tasks', label: 'My Tasks', icon: <CheckSquare size={18} /> },
          { to: '/attendance', label: 'Punch In / Out', icon: <Clock size={18} /> },
          { to: '/leaves', label: 'Apply Leave', icon: <CalendarDays size={18} /> },
          { to: '/eod', label: 'Submit EOD Report', icon: <FileText size={18} /> },
          { to: '/projects', label: 'My Projects', icon: <Briefcase size={18} /> },
          { to: '/service', label: 'My Service Calls', icon: <Wrench size={18} /> },
        ],
      },
    ];
  };

  const navGroups = getNavItems();

  return (
    <aside className="desktop-sidebar">
      {/* Brand Header */}
      <div
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0 20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <img src="/pwa-icon.svg" alt="OpsFlow logo" style={{ width: '32px', height: '32px' }} />
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            OpsFlow <span style={{ color: 'var(--primary)', fontSize: '12px' }}>PWA</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Enterprise Management
          </div>
        </div>
      </div>

      {/* Navigation Links Scrollable Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
        {navGroups.map((group, gIdx) => (
          <div key={group.section} style={{ marginBottom: gIdx === navGroups.length - 1 ? 0 : '20px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                padding: '0 12px 8px',
              }}
            >
              {group.section}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13.5px',
                    fontWeight: 500,
                    textDecoration: 'none',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                    backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                    boxShadow: isActive ? '0 2px 6px rgba(37, 99, 235, 0.4)' : 'none',
                    transition: 'all 0.15s ease',
                  })}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Branding / App Status */}
      <div
        style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(11, 17, 32, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}
      >
        <span>v1.0 • PWA Ready</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)' }} />
          Online
        </span>
      </div>
    </aside>
  );
};
