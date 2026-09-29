import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'react-router-dom';
import { LogOut, User as UserIcon, Clock, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { Role } from '@/types/enums';

export const Header: React.FC = () => {
  const { user, role, logout, switchMockRole } = useAuth();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  // Derive human-readable page title
  const getPageTitle = (path: string): string => {
    if (path.startsWith('/dashboard')) return 'Dashboard';
    if (path.startsWith('/tasks')) return 'Task Management';
    if (path.startsWith('/attendance')) return 'Workforce Attendance';
    if (path.startsWith('/leaves')) return 'Leave Applications';
    if (path.startsWith('/eod')) return 'End of Day (EOD) Reports';
    if (path.startsWith('/projects')) return 'Assigned Projects';
    if (path.startsWith('/service')) return 'Service Operations';
    if (path.startsWith('/customers')) return 'Customer Directory';
    if (path.startsWith('/machines')) return 'Machine Fleet';
    if (path.startsWith('/calendar')) return 'Team Calendar';
    if (path.startsWith('/reports')) return 'Reports & Analytics';
    if (path.startsWith('/permissions')) return 'Access Permissions';
    if (path.startsWith('/audit-logs')) return 'System Audit Trail';
    return 'OpsFlow';
  };

  const roles: { id: Role; label: string }[] = [
    { id: 'owner', label: 'Owner (Master)' },
    { id: 'manager', label: 'Manager' },
    { id: 'employee', label: 'Employee' },
  ];

  return (
    <header className="app-header">
      {/* Left: Page Title & Mobile Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/pwa-icon.svg" alt="OpsFlow" style={{ width: '30px', height: '30px' }} />
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
            {getPageTitle(location.pathname)}
          </h2>
        </div>
      </div>

      {/* Right: Quick Role Switcher (Preview tool) + Live Status + User profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Quick Role Switcher Pill for reviewer convenience */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid var(--border-default)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 500,
            }}
            title="Switch demo role perspective"
          >
            <span>Role:</span>
            <span style={{ textTransform: 'capitalize', color: 'var(--text-primary)', fontWeight: 600 }}>
              {role || 'None'}
            </span>
            <ChevronDown size={14} />
          </button>

          {showRoleMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '6px',
                width: '160px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 60,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                Switch View Role:
              </div>
              {roles.map(r => (
                <button
                  key={r.id}
                  onClick={() => {
                    switchMockRole(r.id);
                    setShowRoleMenu(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: role === r.id ? 'var(--primary)' : 'var(--text-primary)',
                    backgroundColor: role === r.id ? 'var(--primary-light)' : 'transparent',
                  }}
                >
                  <span>{r.label}</span>
                  {role === r.id && <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Live Attendance Punch Status Indicator */}
        <div style={{ display: 'none', alignItems: 'center', gap: '6px' }} className="status-pill">
          <Clock size={16} color="var(--success)" />
          <Badge status="present" label="On Duty" size="sm" />
        </div>

        {/* User Profile & Menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--primary-light)',
                border: '1px solid var(--primary-border)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              {user?.name ? user.name.slice(0, 2).toUpperCase() : <UserIcon size={18} />}
            </div>
            <div style={{ display: 'none', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }} className="user-details-desktop">
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {user?.name}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {user?.employee_code} • {user?.designation || user?.role}
              </span>
            </div>
          </button>

          {showUserMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '6px',
                width: '220px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 60,
                padding: '6px',
              }}
            >
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                  {user?.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  ID: {user?.employee_code}
                </div>
                <div style={{ marginTop: '4px' }}>
                  <Badge status={user?.role || 'employee'} size="sm" />
                </div>
              </div>

              <button
                onClick={() => {
                  setShowUserMenu(false);
                  logout();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px',
                  color: 'var(--danger)',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-xs)',
                  marginTop: '4px',
                }}
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
