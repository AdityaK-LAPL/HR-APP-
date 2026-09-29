import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/feedback/Toast';
import { leaveService } from '@/services/leaveService';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Plus, Calendar, Check, X as XIcon } from 'lucide-react';
import type { LeaveRequest } from '@/types/models';

export const LeavesPage: React.FC = () => {
  const { user, role, can } = useAuth();
  const { success: toastSuccess } = useToast();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const loadLeaves = async () => {
    setIsLoading(true);
    try {
      const res = await leaveService.listLeaves();
      setLeaves(res.items);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLeaves();
  }, []);

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate || !reason.trim()) return;

    await leaveService.applyLeave({
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim(),
    });

    setIsModalOpen(false);
    setStartDate('');
    setEndDate('');
    setReason('');
    toastSuccess('Leave application submitted for approval', 'Application Received');
    loadLeaves();
  };

  const handleApprove = async (id: string) => {
    await leaveService.approveLeave(id, 'Approved by Manager');
    toastSuccess('Leave approved', 'Decision Recorded');
    loadLeaves();
  };

  const handleReject = async (id: string) => {
    await leaveService.rejectLeave(id, 'Staff coverage constraints');
    toastSuccess('Leave rejected', 'Decision Recorded');
    loadLeaves();
  };

  const isManagerOrOwner = role === 'manager' || role === 'owner';

  const columns: Column<LeaveRequest>[] = [
    {
      key: 'employee_name',
      header: 'Applicant',
      render: (l) => l.employee_name || 'Staff Member',
    },
    {
      key: 'dates',
      header: 'Duration',
      render: (l) => `${l.start_date} to ${l.end_date}`,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (l) => l.reason,
    },
    {
      key: 'status',
      header: 'Status',
      render: (l) => <Badge status={l.status} />,
    },
    ...(isManagerOrOwner
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (l: LeaveRequest) =>
              l.status === 'pending' ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button size="sm" variant="success" onClick={() => handleApprove(l.id)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleReject(l.id)}>
                    Reject
                  </Button>
                </div>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {l.comments || 'Finalized'}
                </span>
              ),
          },
        ]
      : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Leave Applications</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Submit time-off requests and review team approval pipelines
          </p>
        </div>

        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setIsModalOpen(true)}>
          Apply for Leave
        </Button>
      </div>

      <Card>
        <DataTable
          columns={columns}
          data={leaves}
          keyExtractor={(l) => l.id}
          isLoading={isLoading}
          emptyMessage="No leave requests found."
        />
      </Card>

      {/* Apply Leave Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Apply for Leave"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleApplyLeave}>
              Submit Application
            </Button>
          </>
        }
      >
        <form onSubmit={handleApplyLeave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <Input
              label="End Date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          <Input
            label="Reason for Leave"
            placeholder="e.g. Medical appointment, family event"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </form>
      </Modal>
    </div>
  );
};
