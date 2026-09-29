import React, { useState, useEffect } from 'react';
import { reportService, type AttendanceReportRow, type TaskStatusReport } from '@/services/reportService';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { BarChart3, Users, CheckCircle, Clock } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const [attReport, setAttReport] = useState<AttendanceReportRow[]>([]);
  const [taskReport, setTaskReport] = useState<TaskStatusReport[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [att, tasks] = await Promise.all([
          reportService.getAttendanceReport(),
          reportService.getTasksReport(),
        ]);
        setAttReport(att);
        setTaskReport(tasks);
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Management Reports &amp; Analytics</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Workforce performance metrics, task completion distributions, and attendance rates
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <Card title="Attendance Performance (Last 30 Days)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {attReport.map(r => (
              <div
                key={r.user_id}
                style={{
                  padding: '12px 14px',
                  backgroundColor: 'var(--bg-input)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{r.user_name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Total Time: {Math.floor(r.total_minutes / 60)} hours
                  </div>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--success)' }}>
                  {r.days_present} Days Present
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Task Velocity by Status">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {taskReport.map(t => (
              <div
                key={t.status}
                style={{
                  padding: '12px 14px',
                  backgroundColor: 'var(--bg-input)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Badge status={t.status} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                  {t.count} Tasks
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
