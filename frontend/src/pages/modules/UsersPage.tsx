import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Users, Shield } from 'lucide-react';
import { MOCK_USERS } from '@/services/mockData';
import type { UserProfile } from '@/types/models';

export const UsersPage: React.FC = () => {
  const usersList = Object.values(MOCK_USERS);

  const columns: Column<UserProfile>[] = [
    {
      key: 'employee_code',
      header: 'Employee ID',
      render: (u) => (
        <span style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
          {u.employee_code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Staff Name',
      render: (u) => (
        <div>
          <div style={{ fontWeight: 600 }}>{u.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{u.designation || 'Staff'}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Access Role',
      render: (u) => <Badge status={u.role} />,
    },
    {
      key: 'manager',
      header: 'Reports To',
      render: (u) => (u.manager_id ? 'David Chen (MGR001)' : 'Direct to Company Owner'),
    },
    {
      key: 'is_active',
      header: 'Account Status',
      render: (u) => <Badge status={u.is_active ? 'active' : 'inactive'} />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Staff &amp; Hierarchy Management</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Company employees, managers, reporting relationships, and account statuses
        </p>
      </div>

      <Card>
        <DataTable
          columns={columns}
          data={usersList}
          keyExtractor={(u) => u.id}
          emptyMessage="No employees found."
        />
      </Card>
    </div>
  );
};
