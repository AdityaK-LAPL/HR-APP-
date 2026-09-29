import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/feedback/Toast';
import { taskService } from '@/services/taskService';
import { leaveService } from '@/services/leaveService';
import { serviceCallService } from '@/services/serviceCallService';
import { attendanceService } from '@/services/attendanceService';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Users,
  CheckSquare,
  CalendarDays,
  Wrench,
  Clock,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import type { Task, LeaveRequest, ServiceCall, AttendanceDay } from '@/types/models';

export const ManagerDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { success: toastSuccess } = useToast();

  const [teamTasks, setTeamTasks] = useState<Task[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [serviceCalls, setServiceCalls] = useState<ServiceCall[]>([]);
  const [teamAttendance, setTeamAttendance] = useState<AttendanceDay[]>([]);

  useEffect(() => {
    const loadManagerData = async () => {
      try {
        const [taskRes, leaveRes, scRes, attRes] = await Promise.all([
          taskService.listTasks(),
          leaveService.listLeaves({ status: 'pending' }),
          serviceCallService.listServiceCalls(),
          attendanceService.listAttendance(),
        ]);
        setTeamTasks(taskRes.items.slice(0, 6));
        setPendingLeaves(leaveRes.items);
        setServiceCalls(scRes.items.slice(0, 4));
        setTeamAttendance(attRes.items.slice(0, 5));
      } catch (err) {
        console.error('Failed to load manager dashboard data', err);
      }
    };
    loadManagerData();
  }, []);

  const handleQuickApproveLeave = async (id: string, name?: string) => {
    try {
      await leaveService.approveLeave(id, 'Approved via Manager Dashboard');
      setPendingLeaves(prev => prev.filter(l => l.id !== id));
      toastSuccess(`Approved leave application for ${name || 'employee'}`, 'Leave Approved');
    } catch {
      //
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Manager Welcome Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
            Manager Operations Console
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Welcome back, {user?.name}. Supervising Field &amp; Engineering Teams.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <Button variant="outline" size="sm" onClick={() => navigate('/tasks')} icon={<CheckSquare size={16} />}>
            Assign Task
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/service')} icon={<Wrench size={16} />}>
            New Service Call
          </Button>
        </div>
      </div>

      {/* Team Health Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        <div className="glass-card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Team Present Today</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{teamAttendance.length} Members</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--warning-light)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Pending Approvals</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{pendingLeaves.length} Requests</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wrench size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Open Service Calls</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{serviceCalls.length} Active</div>
          </div>
        </div>
      </div>

      {/* Pending Leave Approvals Banner (if any) */}
      {pendingLeaves.length > 0 && (
        <Card
          title="Pending Leave Approvals"
          subtitle="Requests awaiting your review and authorization"
          action={<Badge status="pending" label={`${pendingLeaves.length} Action Needed`} />}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pendingLeaves.map(leave => (
              <div
                key={leave.id}
                style={{
                  padding: '14px 16px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--warning-border)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{leave.employee_name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Dates: <strong>{leave.start_date}</strong> to <strong>{leave.end_date}</strong>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Reason: {leave.reason}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => handleQuickApproveLeave(leave.id, leave.employee_name)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/leaves')}
                  >
                    Details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Multi-column grid: Team Tasks & Service Calls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Team Tasks */}
        <Card
          title="Team &amp; Self Tasks"
          subtitle="Tasks assigned across your managed team"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
              Manage All
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {teamTasks.map(t => (
              <div
                key={t.id}
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13.5px' }}>{t.title}</span>
                  <Badge status={t.status} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>Assignee: {t.assignee_name}</span>
                  <Badge status={t.priority} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Live Service Operations */}
        <Card
          title="Service Operations"
          subtitle="Calls logged for customer machinery"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/service')}>
              Service Desk
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {serviceCalls.map(sc => (
              <div
                key={sc.id}
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13.5px' }}>{sc.service_call_code}</span>
                  <Badge status={sc.priority} />
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                  {sc.customer_name} — {sc.machine_model}
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                  {sc.issue_reported}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
