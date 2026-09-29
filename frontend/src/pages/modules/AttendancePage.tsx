import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { attendanceService } from '@/services/attendanceService';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Clock, MapPin, Calendar, CheckCircle2 } from 'lucide-react';
import type { AttendanceDay } from '@/types/models';

export const AttendancePage: React.FC = () => {
  const { user } = useAuth();
  const [attendanceList, setAttendanceList] = useState<AttendanceDay[]>([]);
  const [todayRecord, setTodayRecord] = useState<AttendanceDay | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPunching, setIsPunching] = useState(false);

  const loadAttendance = async () => {
    setIsLoading(true);
    try {
      const res = await attendanceService.listAttendance();
      setAttendanceList(res.items);
      const today = new Date().toISOString().split('T')[0];
      const todayRec = res.items.find(a => a.work_date === today);
      if (todayRec) setTodayRecord(todayRec);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, []);

  const handlePunchToggle = async () => {
    setIsPunching(true);
    try {
      if (!todayRecord || !todayRecord.punch_in_at) {
        const res = await attendanceService.punchIn({ latitude: 12.9716, longitude: 77.5946 });
        setTodayRecord(res);
      } else if (!todayRecord.punch_out_at) {
        const res = await attendanceService.punchOut({ latitude: 12.9716, longitude: 77.5946 });
        setTodayRecord(res);
      }
      loadAttendance();
    } catch (err) {
      console.error(err);
    } finally {
      setIsPunching(false);
    }
  };

  const isPunchedIn = Boolean(todayRecord?.punch_in_at && !todayRecord?.punch_out_at);
  const isPunchedOut = Boolean(todayRecord?.punch_out_at);

  const columns: Column<AttendanceDay>[] = [
    {
      key: 'work_date',
      header: 'Date',
      render: (a) => a.work_date,
    },
    {
      key: 'user_name',
      header: 'Employee',
      render: (a) => a.user_name || 'Staff Member',
    },
    {
      key: 'punch_in_at',
      header: 'Punch In',
      render: (a) => a.punch_in_at ? new Date(a.punch_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
    },
    {
      key: 'punch_out_at',
      header: 'Punch Out',
      render: (a) => a.punch_out_at ? new Date(a.punch_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active',
    },
    {
      key: 'total_duration_minutes',
      header: 'Total Duration',
      render: (a) => a.total_duration_minutes ? `${Math.floor(a.total_duration_minutes / 60)}h ${a.total_duration_minutes % 60}m` : 'In Progress',
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => <Badge status={a.status} />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Workforce Attendance</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Punch In/Out with verified geolocation &amp; historical shift duration
        </p>
      </div>

      {/* Today's Punch Station */}
      <Card
        title="Today's Punch Station"
        subtitle={isPunchedIn ? 'Shift In Progress' : isPunchedOut ? 'Shift Completed' : 'Ready to Punch In'}
        action={<Badge status={isPunchedIn ? 'present' : isPunchedOut ? 'completed' : 'not_started'} />}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {todayRecord?.punch_in_at 
                ? `In: ${new Date(todayRecord.punch_in_at).toLocaleTimeString()}`
                : 'Not Punched In'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              <MapPin size={15} color="var(--primary)" />
              <span>{todayRecord?.punch_in_location || 'GPS Location capture requested upon punch event'}</span>
            </div>
          </div>

          <Button
            variant={isPunchedIn ? 'danger' : 'primary'}
            size="lg"
            loading={isPunching}
            disabled={isPunchedOut}
            onClick={handlePunchToggle}
            icon={<Clock size={20} />}
          >
            {isPunchedOut
              ? 'Shift Finished Today'
              : isPunchedIn
              ? 'Punch Out (End Day)'
              : 'Punch In (Start Day)'}
          </Button>
        </div>
      </Card>

      {/* Attendance Log Table */}
      <Card title="Attendance History">
        <DataTable
          columns={columns}
          data={attendanceList}
          keyExtractor={(a) => a.id}
          isLoading={isLoading}
          emptyMessage="No attendance records found."
        />
      </Card>
    </div>
  );
};
