import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/feedback/Toast';
import { eodService } from '@/services/eodService';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Plus, FileText } from 'lucide-react';
import type { EodReport } from '@/types/models';

export const EodPage: React.FC = () => {
  const { user } = useAuth();
  const { success: toastSuccess } = useToast();
  const [reports, setReports] = useState<EodReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [workCompleted, setWorkCompleted] = useState('');
  const [workRemaining, setWorkRemaining] = useState('');
  const [issues, setIssues] = useState('');
  const [notes, setNotes] = useState('');

  const loadReports = async () => {
    setIsLoading(true);
    try {
      const res = await eodService.listEod();
      setReports(res.items);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleSubmitEod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workCompleted.trim()) return;

    await eodService.submitEod({
      report_date: reportDate,
      work_completed: workCompleted.trim(),
      work_remaining: workRemaining.trim() || undefined,
      issues: issues.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    setIsModalOpen(false);
    setWorkCompleted('');
    setWorkRemaining('');
    setIssues('');
    setNotes('');
    toastSuccess('EOD report successfully submitted!', 'Report Logged');
    loadReports();
  };

  const columns: Column<EodReport>[] = [
    {
      key: 'report_date',
      header: 'Report Date',
      render: (r) => r.report_date,
    },
    {
      key: 'user_name',
      header: 'Submitted By',
      render: (r) => r.user_name || 'Staff Member',
    },
    {
      key: 'work_completed',
      header: 'Work Completed',
      render: (r) => (
        <div style={{ maxWidth: '380px', whiteSpace: 'normal' }}>
          <div style={{ fontWeight: 500 }}>{r.work_completed}</div>
          {r.issues && (
            <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '2px' }}>
              Issue: {r.issues}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'work_remaining',
      header: 'Pending / Remaining',
      render: (r) => r.work_remaining || 'None',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>End Of Day (EOD) Reports</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Daily progress submissions, blockers, and notes
          </p>
        </div>

        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setIsModalOpen(true)}>
          Submit Today's EOD
        </Button>
      </div>

      <Card>
        <DataTable
          columns={columns}
          data={reports}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No EOD reports found."
        />
      </Card>

      {/* Submit EOD Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Submit End Of Day (EOD) Report"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmitEod}>
              Submit Report
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitEod} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label="Report Date"
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            required
          />

          <Input
            label="Work Completed"
            placeholder="Key tasks completed, client calls conducted, calibrations executed"
            value={workCompleted}
            onChange={(e) => setWorkCompleted(e.target.value)}
            required
          />

          <Input
            label="Work Remaining (Optional)"
            placeholder="Items continuing tomorrow or waiting on parts"
            value={workRemaining}
            onChange={(e) => setWorkRemaining(e.target.value)}
          />

          <Input
            label="Problems / Issues Encountered (Optional)"
            placeholder="Any technical blockers or delay reasons"
            value={issues}
            onChange={(e) => setIssues(e.target.value)}
          />

          <Input
            label="Additional Notes"
            placeholder="Feedback for manager or follow-up notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </form>
      </Modal>
    </div>
  );
};
