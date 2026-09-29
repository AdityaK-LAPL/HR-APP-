import React, { useState, useEffect } from 'react';
import { customerService } from '@/services/customerService';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Building2, Cpu, MapPin } from 'lucide-react';
import type { Customer } from '@/types/models';

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await customerService.listCustomers();
        setCustomers(res.items);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const columns: Column<Customer>[] = [
    {
      key: 'customer_code',
      header: 'Customer ID',
      render: (c) => (
        <span style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
          {c.customer_code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Company / Customer Name',
      render: (c) => (
        <div>
          <div style={{ fontWeight: 600 }}>{c.name}</div>
          {c.notes && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.notes}</div>}
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Location / Address',
      render: (c) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          <MapPin size={14} color="var(--text-muted)" />
          <span>{c.address || '—'}</span>
        </div>
      ),
    },
    {
      key: 'machines_count',
      header: 'Fleet Size',
      render: (c) => `${c.machines_count || 0} Machines`,
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (c) => <Badge status={c.is_active ? 'active' : 'inactive'} />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Customer Directory</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Client companies, contacts, machine holdings, and historical service records
        </p>
      </div>

      <Card>
        <DataTable
          columns={columns}
          data={customers}
          keyExtractor={(c) => c.id}
          isLoading={isLoading}
          emptyMessage="No customers found."
        />
      </Card>
    </div>
  );
};
