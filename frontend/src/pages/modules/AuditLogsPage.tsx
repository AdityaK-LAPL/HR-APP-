import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { History, ShieldAlert } from 'lucide-react';
import { MOCK_AUDIT_LOGS } from '@/services/mockData';
import type { AuditLog } from '@/types/models';

export const AuditLogsPage: React.FC = () => {
  const columns: Column<AuditLog>[] = [
    {
      key: 'created_at',
      header: 'Timestamp',
      render: (log) => new Date(log.created_at).toLocaleString(),
    },
    {
      key: 'actor_name',
      header: 'Actor',
      render: (log) => log.actor_name || log.actor_user_id,
    },
    {
      key: 'action',
      header: 'Action',
      render: (log) => <Badge status="present" label={log.action} />,
    },
    {
      key: 'entity',
      header: 'Target Entity',
      render: (log) => `${log.entity_type} #${log.entity_id}`,
    },
    {
      key: 'payload',
      header: 'Audit Payload',
      render: (log) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
          {JSON.stringify(log.new_value)}
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>System Audit Trail</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Append-only immutable record of sensitive business operations and security events
        </p>
      </div>

      <Card>
        <DataTable
          columns={columns}
          data={MOCK_AUDIT_LOGS}
          keyExtractor={(log) => log.id}
          emptyMessage="No audit logs recorded."
        />
      </Card>
    </div>
  );
};
