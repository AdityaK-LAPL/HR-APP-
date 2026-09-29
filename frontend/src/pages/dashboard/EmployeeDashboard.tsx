import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/feedback/Toast';
import { attendanceService } from '@/services/attendanceService';
import { taskService } from '@/services/taskService';
import { serviceCallService } from '@/services/serviceCallService';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Clock,
  CheckCircle2,
  CalendarDays,
  FileText,
  MapPin,
  Wrench,
  ArrowRight,
} from 'lucide-react';
import type { Task, ServiceCall, AttendanceDay } from '@/types/models';
import { useNavigate } from 'react-router-dom';

export const EmployeeDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [serviceCalls, setServiceCalls] = useState<ServiceCall[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceDay | null>(null);
  const [isPunching, setIsPunching] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  // Clock tick
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial employee dashboard data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [taskRes, scRes, attRes] = await Promise.all([
          taskService.listTasks({ assigned_to: user?.id || 'user-employee' }),
          serviceCallService.listServiceCalls(),
          attendanceService.listAttendance({ user_id: user?.id || 'user-employee' }),
        ]);
        setTasks(taskRes.items.slice(0, 5));
        setServiceCalls(scRes.items.slice(0, 3));
        const today = new Date().toISOString().split('T')[0];
        const record = attRes.items.find(a => a.work_date === today);
        if (record) setTodayAttendance(record);
      } catch (err) {
        console.error('Failed to load employee dashboard data', err);
      }
    };
    loadData();
  }, [user]);

  const handlePunchToggle = async () => {
    setIsPunching(true);
    try {
      if (!todayAttendance || !todayAttendance.punch_in_at) {
        // Punch in with mock/real coordinates
        const result = await attendanceService.punchIn({ latitude: 12.9716, longitude: 77.5946 });
        setTodayAttendance(result);
        toastSuccess('Successfully punched in for today!', 'Attendance Recorded');
      } else if (!todayAttendance.punch_out_at) {
        const result = await attendanceService.punchOut({ latitude: 12.9716, longitude: 77.5946 });
        setTodayAttendance(result);
        toastSuccess('Successfully punched out. Have a great evening!', 'Workday Completed');
      }
    } catch (err: any) {
      toastError(err?.message || 'Failed to record punch', 'Attendance Error');
    } finally {
      setIsPunching(false);
    }
  };

  const isPunchedIn = Boolean(todayAttendance?.punch_in_at && !todayAttendance?.punch_out_at);
  const isPunchedOut = Boolean(todayAttendance?.punch_out_at);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Welcome Banner */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
          Hello, {user?.name?.split(' ')[0] || 'Technician'} 👋
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Top Action Grid: Attendance Punch Bar + Quick Actions */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Attendance Punch Card */}
        <Card
          title="Daily Attendance"
          subtitle={isPunchedIn ? 'Currently on duty' : isPunchedOut ? 'Shift ended' : 'Shift not started'}
          action={<Badge status={isPunchedIn ? 'present' : isPunchedOut ? 'completed' : 'not_started'} />}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {currentTime}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Local Time</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <MapPin size={16} color="var(--primary)" />
              <span>Bangalore Technical Facility &amp; Client Sites</span>
            </div>

            <Button
              variant={isPunchedIn ? 'danger' : 'primary'}
              size="lg"
              loading={isPunching}
              disabled={isPunchedOut}
              onClick={handlePunchToggle}
              icon={<Clock size={20} />}
              style={{ width: '100%', minHeight: '48px', fontWeight: 600 }}
            >
              {isPunchedOut
                ? 'Punch Completed for Today'
                : isPunchedIn
                ? 'Punch Out (End Workday)'
                : 'Punch In (Start Workday)'}
            </Button>
          </div>
        </Card>

        {/* Quick Operations Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            className="glass-card"
            style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
            onClick={() => navigate('/leaves')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--primary-light)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CalendarDays size={22} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Apply for Leave</h4>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                  Submit date range for Manager sign-off
                </p>
              </div>
            </div>
            <ArrowRight size={18} color="var(--text-muted)" />
          </div>

          <div
            className="glass-card"
            style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
            onClick={() => navigate('/eod')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--success-light)',
                  color: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FileText size={22} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Submit EOD Report</h4>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                  Log completed work, issues &amp; notes
                </p>
              </div>
            </div>
            <ArrowRight size={18} color="var(--text-muted)" />
          </div>
        </div>
      </div>

      {/* Today's Tasks Card Section */}
      <Card
        title="Today's Assigned Tasks"
        subtitle={`${tasks.length} tasks scheduled for you`}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
            View All Tasks
          </Button>
        }
      >
        {tasks.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={32} />}
            title="No tasks scheduled today"
            description="You're all caught up on your allotted daily task queue."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {tasks.map(t => (
              <div
                key={t.id}
                style={{
                  padding: '14px 16px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                    {t.title}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <Badge status={t.priority} />
                    <Badge status={t.status} />
                  </div>
                </div>

                {t.description && (
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {t.description}
                  </p>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>Project: {t.project_name || 'General Operations'}</span>
                  <span>Assigned by {t.assigner_name}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Active Service Assignments Card */}
      <Card
        title="My Service Assignments"
        subtitle="Machines and client service calls requiring your attention"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/service')}>
            Open Service Logs
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {serviceCalls.map(sc => (
            <div
              key={sc.id}
              style={{
                padding: '14px 16px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Wrench size={16} color="var(--primary)" />
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{sc.service_call_code}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>• {sc.customer_name}</span>
                </div>
                <Badge status={sc.status} />
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                Machine: <strong>{sc.machine_model}</strong> ({sc.machine_serial})
              </div>

              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                {sc.issue_reported}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
