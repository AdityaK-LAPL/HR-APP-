import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { reportService } from '@/services/reportService';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Building2,
  Users,
  Briefcase,
  Wrench,
  ShieldCheck,
  History,
  TrendingUp,
  Cpu,
  BarChart3,
  CalendarDays,
  FileText,
  Clock,
} from 'lucide-react';
import { MOCK_AUDIT_LOGS } from '@/services/mockData';

export const OwnerDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalStaff: 12,
    activeProjects: 4,
    openServiceCalls: 5,
    todayAttendanceRate: '94%',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Master Overview Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
              Company Master Console
            </h1>
            <Badge status="owner" label="Full Access" />
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Welcome, {user?.name}. Enterprise workforce, machine assets, and governance control.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <Button variant="outline" size="sm" onClick={() => navigate('/permissions')} icon={<ShieldCheck size={16} />}>
            Configure Permissions
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/reports')} icon={<BarChart3 size={16} />}>
            Analytics &amp; Exports
          </Button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Staff Count</span>
            <Users size={18} color="var(--primary)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{stats.totalStaff} Members</div>
          <div style={{ fontSize: '12px', color: 'var(--success)', marginTop: '4px' }}>
            Active across 3 Departments
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Active Projects</span>
            <Briefcase size={18} color="var(--accent-cyan)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{stats.activeProjects} In Progress</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Next milestone due in 4 days
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Open Service Calls</span>
            <Wrench size={18} color="var(--warning)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{stats.openServiceCalls} Calls</div>
          <div style={{ fontSize: '12px', color: 'var(--warning)', marginTop: '4px' }}>
            1 Urgent priority ticket
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Today's Attendance</span>
            <TrendingUp size={18} color="var(--success)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{stats.todayAttendanceRate}</div>
          <div style={{ fontSize: '12px', color: 'var(--success)', marginTop: '4px' }}>
            1 Approved scheduled leave
          </div>
        </div>
      </div>

      {/* Owner Navigation Hub Grid */}
      <div>
        <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem', fontWeight: 600 }}>
          Enterprise Management Modules
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
          {[
            { title: 'Employees & Hierarchy', desc: 'Org tree, manager reporting lines, user profiles', path: '/users', icon: <Users size={22} color="var(--primary)" /> },
            { title: 'Customer Profiles', desc: 'Client directory, contacts, service agreements', path: '/customers', icon: <Building2 size={22} color="var(--accent-cyan)" /> },
            { title: 'Machine Fleet', desc: 'Sold machinery, serial numbers, warranty status', path: '/machines', icon: <Cpu size={22} color="#a855f7" /> },
            { title: 'Service Operations', desc: 'Service dispatch, field visits, signed reports', path: '/service', icon: <Wrench size={22} color="var(--warning)" /> },
            { title: 'Workforce Attendance', desc: 'Punches, geolocation logs, work hour totals', path: '/attendance', icon: <Clock size={22} color="var(--success)" /> },
            { title: 'Team Calendar', desc: 'Consolidated tasks, milestones and leave dates', path: '/calendar', icon: <CalendarDays size={22} color="#38bdf8" /> },
            { title: 'Permissions Matrix', desc: 'Owner-configured cross-manager access grants', path: '/permissions', icon: <ShieldCheck size={22} color="#ec4899" /> },
            { title: 'Immutable Audit Trail', desc: 'Full business log of sensitive company actions', path: '/audit-logs', icon: <History size={22} color="#94a3b8" /> },
          ].map(mod => (
            <div
              key={mod.title}
              className="glass-card"
              style={{
                padding: '18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                cursor: 'pointer',
              }}
              onClick={() => navigate(mod.path)}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(30, 41, 59, 0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {mod.icon}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{mod.title}</h4>
                <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>
                  {mod.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent System Audit Activity */}
      <Card
        title="Recent System Audit Entries"
        subtitle="Immutable security trail of critical state changes"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/audit-logs')}>
            View All Audit Logs
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {MOCK_AUDIT_LOGS.map(log => (
            <div
              key={log.id}
              style={{
                padding: '12px 14px',
                backgroundColor: 'var(--bg-input)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                fontSize: '13px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Badge status="present" label={log.action} size="sm" />
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  Actor: {log.actor_name}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  ({log.entity_type} #{log.entity_id})
                </span>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                {new Date(log.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
