import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ShieldCheck, Lock, Info } from 'lucide-react';

export const PermissionsPage: React.FC = () => {
  const permissionsList = [
    { key: 'view_manager_team', desc: "View a peer/other Manager's list of direct reports", role: 'manager', effect: 'deny_by_default' },
    { key: 'view_manager_reports', desc: "View a peer/other Manager's EOD reports, tasks, attendance", role: 'manager', effect: 'deny_by_default' },
    { key: 'assign_tasks_to_manager', desc: 'Create/assign tasks targeted at another Manager', role: 'manager', effect: 'deny_by_default' },
    { key: 'modify_project', desc: 'Edit a project fields/status (vs. view-only)', role: 'manager', effect: 'allow_for_owner' },
    { key: 'create_project', desc: 'Create new projects', role: 'manager', effect: 'allow_by_default' },
    { key: 'delete_archive_project', desc: 'Archive/deactivate a project (requires Owner grant)', role: 'manager', effect: 'deny_by_default' },
    { key: 'assign_employees_to_project', desc: 'Add/remove project members', role: 'manager', effect: 'allow_by_default' },
    { key: 'assign_employees_to_service_call', desc: "Assign employees on another manager's service call", role: 'manager', effect: 'deny_by_default' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Owner Permissions Matrix</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Configurable cross-manager access rules, reporting scopes, and override grants
        </p>
      </div>

      <div
        className="glass-card"
        style={{
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: 'var(--primary-light)',
          border: '1px solid var(--primary-border)',
        }}
      >
        <Info size={20} color="var(--primary)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
          <strong>Hierarchy Model:</strong> Default access flows down the reporting tree (Owner → Manager → Subtree).
          Explicit Owner grants unlock cross-branch delegation without hardcoded exceptions.
        </div>
      </div>

      <Card title="System Permission Catalog &amp; Defaults">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {permissionsList.map(p => (
            <div
              key={p.key}
              style={{
                padding: '14px',
                backgroundColor: 'var(--bg-input)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>
                  {p.key}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {p.desc}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <Badge status={p.role} label={`Role: ${p.role}`} />
                <Badge status={p.effect === 'allow_by_default' ? 'present' : 'pending'} label={p.effect.replace(/_/g, ' ')} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
