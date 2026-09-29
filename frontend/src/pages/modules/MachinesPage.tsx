import React, { useState, useEffect } from 'react';
import { machineService } from '@/services/machineService';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Cpu, ShieldCheck } from 'lucide-react';
import type { Machine } from '@/types/models';

export const MachinesPage: React.FC = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await machineService.listMachines();
        setMachines(res.items);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const columns: Column<Machine>[] = [
    {
      key: 'machine_code',
      header: 'Machine ID',
      render: (m) => (
        <span style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
          {m.machine_code}
        </span>
      ),
    },
    {
      key: 'model_name',
      header: 'Model & Serial #',
      render: (m) => (
        <div>
          <div style={{ fontWeight: 600 }}>{m.model_name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {m.serial_number}
          </div>
        </div>
      ),
    },
    {
      key: 'customer_name',
      header: 'Owner Customer',
      render: (m) => m.customer_name || 'Apex Robotics Ltd',
    },
    {
      key: 'warranty_info',
      header: 'Warranty / AMC',
      render: (m) => m.warranty_info || 'Standard',
    },
    {
      key: 'status',
      header: 'Status',
      render: (m) => <Badge status={m.status} />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Machine Fleet</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Serial tracking, installation records, and persistent service histories
        </p>
      </div>

      <Card>
        <DataTable
          columns={columns}
          data={machines}
          keyExtractor={(m) => m.id}
          isLoading={isLoading}
          emptyMessage="No machines registered."
        />
      </Card>
    </div>
  );
};
