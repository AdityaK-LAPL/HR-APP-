import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CalendarDays, CheckSquare } from 'lucide-react';

export const CalendarPage: React.FC = () => {
  const sampleEvents = [
    { date: 'Today', type: 'task', title: 'Diagnostic field inspection for Apex Mill 3', staff: 'Alex Rivera', status: 'in_progress' },
    { date: 'Today', type: 'task', title: 'Calibrate pressure sensors', staff: 'Priya Patel', status: 'completed' },
    { date: 'Tomorrow', type: 'task', title: 'Deploy v2.4 patch on Omni Press #4', staff: 'Alex Rivera', status: 'not_started' },
    { date: 'Sep 28 - Sep 30', type: 'leave', title: 'Scheduled Annual Leave', staff: 'Priya Patel', status: 'pending' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Team Calendar</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Aggregated schedule of team tasks, service appointments, and approved leaves
        </p>
      </div>

      <Card title="Upcoming Schedule &amp; Team Allocations">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sampleEvents.map((evt, idx) => (
            <div
              key={idx}
              style={{
                padding: '14px 16px',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: evt.type === 'leave' ? 'var(--warning-light)' : 'var(--primary-light)',
                    color: evt.type === 'leave' ? 'var(--warning)' : 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {evt.type === 'leave' ? <CalendarDays size={20} /> : <CheckSquare size={20} />}
                </div>

                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{evt.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {evt.date} • {evt.staff}
                  </div>
                </div>
              </div>

              <Badge status={evt.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
