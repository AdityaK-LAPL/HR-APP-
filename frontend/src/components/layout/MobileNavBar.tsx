import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  CheckSquare,
  Clock,
  Wrench,
  Menu,
  X,
  CalendarDays,
  FileText,
  Briefcase,
  Users,
  Building2,
  Cpu,
  BarChart3,
  ShieldCheck,
  History,
  LogOut,
} from 'lucide-react';

export const MobileNavBar: React.FC = () => {
  const { role, logout, user } = useAuth();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Bottom navigation items (top 4 primary actions + More)
  const getBottomNavItems = () => {
    if (role === 'owner') {
      return [
        { to: '/dashboard', label: 'Overview', icon: <LayoutDashboard size={20} /> },
        { to: '/tasks', label: 'Tasks', icon: <CheckSquare size={20} /> },
        { to: '/service', label: 'Service', icon: <Wrench size={20} /> },
        { to: '/calendar', label: 'Calendar', icon: <CalendarDays size={20} /> },
      ];
    }
    if (role === 'manager') {
      return [
        { to: '/dashboard', label: 'Overview', icon: <LayoutDashboard size={20} /> },
        { to: '/tasks', label: 'Tasks', icon: <CheckSquare size={20} /> },
        { to: '/leaves', label: 'Approvals', icon: <CalendarDays size={20} /> },
        { to: '/service', label: 'Service', icon: <Wrench size={20} /> },
      ];
    }
    // Employee
    return [
      { to: '/dashboard', label: 'Home', icon: <LayoutDashboard size={20} /> },
      { to: '/tasks', label: 'Tasks', icon: <CheckSquare size={20} /> },
      { to: '/attendance', label: 'Punch', icon: <Clock size={20} /> },
      { to: '/service', label: 'Service', icon: <Wrench size={20} /> },
    ];
  };

  // Extended drawer navigation items
  const getAllNavItems = () => {
    if (role === 'owner') {
      return [
        { to: '/dashboard', label: 'Company Overview', icon: <LayoutDashboard size={18} /> },
        { to: '/users', label: 'Employees & Hierarchy', icon: <Users size={18} /> },
        { to: '/tasks', label: 'Company Tasks', icon: <CheckSquare size={18} /> },
        { to: '/projects', label: 'Projects', icon: <Briefcase size={18} /> },
        { to: '/leaves', label: 'Leaves', icon: <CalendarDays size={18} /> },
        { to: '/attendance', label: 'Attendance', icon: <Clock size={18} /> },
        { to: '/eod', label: 'EOD Submissions', icon: <FileText size={18} /> },
        { to: '/customers', label: 'Customers', icon: <Building2 size={18} /> },
        { to: '/machines', label: 'Machines', icon: <Cpu size={18} /> },
        { to: '/service', label: 'Service Calls', icon: <Wrench size={18} /> },
        { to: '/calendar', label: 'Calendar', icon: <CalendarDays size={18} /> },
        { to: '/reports', label: 'Reports', icon: <BarChart3 size={18} /> },
        { to: '/permissions', label: 'Permissions', icon: <ShieldCheck size={18} /> },
        { to: '/audit-logs', label: 'Audit Trail', icon: <History size={18} /> },
      ];
    }
    if (role === 'manager') {
      return [
        { to: '/dashboard', label: 'Manager Dashboard', icon: <LayoutDashboard size={18} /> },
        { to: '/tasks', label: 'Tasks (Team & Self)', icon: <CheckSquare size={18} /> },
        { to: '/leaves', label: 'Leave Approvals', icon: <CalendarDays size={18} /> },
        { to: '/eod', label: 'EOD Review', icon: <FileText size={18} /> },
        { to: '/attendance', label: 'Team Attendance', icon: <Clock size={18} /> },
        { to: '/projects', label: 'Projects', icon: <Briefcase size={18} /> },
        { to: '/customers', label: 'Customers', icon: <Building2 size={18} /> },
        { to: '/machines', label: 'Machines', icon: <Cpu size={18} /> },
        { to: '/service', label: 'Service Operations', icon: <Wrench size={18} /> },
        { to: '/calendar', label: 'Calendar', icon: <CalendarDays size={18} /> },
        { to: '/reports', label: 'Team Reports', icon: <BarChart3 size={18} /> },
      ];
    }
    return [
      { to: '/dashboard', label: 'My Dashboard', icon: <LayoutDashboard size={18} /> },
      { to: '/tasks', label: 'My Tasks', icon: <CheckSquare size={18} /> },
      { to: '/attendance', label: 'Punch In / Out', icon: <Clock size={18} /> },
      { to: '/leaves', label: 'Apply Leave', icon: <CalendarDays size={18} /> },
      { to: '/eod', label: 'Submit EOD Report', icon: <FileText size={18} /> },
      { to: '/projects', label: 'My Projects', icon: <Briefcase size={18} /> },
      { to: '/service', label: 'My Service Assignments', icon: <Wrench size={18} /> },
    ];
  };

  const navItems = getBottomNavItems();
  const drawerItems = getAllNavItems();

  return (
    <>
      {/* Fixed Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}

        {/* More Menu Drawer Trigger */}
        <button
          onClick={() => setIsDrawerOpen(true)}
          className="mobile-nav-item"
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>

      {/* Slide-over Drawer for Full Mobile Navigation */}
      {isDrawerOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            style={{
              width: '82%',
              maxWidth: '320px',
              height: '100%',
              backgroundColor: 'var(--bg-surface)',
              borderLeft: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              paddingBottom: 'var(--safe-bottom)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>
                  {user?.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {user?.employee_code} • {user?.role}
                </div>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                style={{ padding: '6px', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigation Links */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {drawerItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setIsDrawerOpen(false)}
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '14px',
                      fontWeight: 500,
                      textDecoration: 'none',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                      backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                    })}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>

            {/* Logout Action */}
            <div style={{ padding: '16px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  logout();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px',
                  backgroundColor: 'var(--danger-light)',
                  color: 'var(--danger)',
                  border: '1px solid var(--danger-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
