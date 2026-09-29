import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/feedback/Toast';
import { serviceCallService } from '@/services/serviceCallService';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Wrench, Plus, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { ServiceCall } from '@/types/models';
import type { ServiceCallPriority, ServiceType, ContactMethod } from '@/types/enums';

export const ServicePage: React.FC = () => {
  const { role, can } = useAuth();
  const { success: toastSuccess } = useToast();
  const [calls, setCalls] = useState<ServiceCall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form
  const [callCode, setCallCode] = useState(`SC-2026-00${Math.floor(Math.random() * 90) + 10}`);
  const [customerName, setCustomerName] = useState('Apex Robotics Ltd');
  const [machineModel, setMachineModel] = useState('Apex CNC Mill Pro 3');
  const [issue, setIssue] = useState('');
  const [priority, setPriority] = useState<ServiceCallPriority>('medium');
  const [serviceType, setServiceType] = useState<ServiceType>('field_visit');

  const loadCalls = async () => {
    setIsLoading(true);
    try {
      const res = await serviceCallService.listServiceCalls();
      setCalls(res.items);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCalls();
  }, []);

  const handleCreateCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue.trim()) return;

    await serviceCallService.createServiceCall({
      service_call_code: callCode,
      customer_id: 'cust-1',
      machine_id: 'mach-1',
      contacted_at: new Date().toISOString(),
      contact_method: 'phone',
      issue_reported: issue.trim(),
      priority,
      service_type: serviceType,
    });

    setIsModalOpen(false);
    setIssue('');
    setCallCode(`SC-2026-00${Math.floor(Math.random() * 90) + 10}`);
    toastSuccess('New Service Call registered immediately!', 'Service Desk');
    loadCalls();
  };

  const columns: Column<ServiceCall>[] = [
    {
      key: 'service_call_code',
      header: 'Call Code',
      render: (sc) => (
        <span style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
          {sc.service_call_code}
        </span>
      ),
    },
    {
      key: 'customer_name',
      header: 'Customer & Machine',
      render: (sc) => (
        <div>
          <div style={{ fontWeight: 600 }}>{sc.customer_name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {sc.machine_model} ({sc.machine_serial})
          </div>
        </div>
      ),
    },
    {
      key: 'issue_reported',
      header: 'Reported Issue',
      render: (sc) => (
        <div style={{ maxWidth: '320px', whiteSpace: 'normal', fontSize: '13px' }}>
          {sc.issue_reported}
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (sc) => <Badge status={sc.priority} />,
    },
    {
      key: 'service_type',
      header: 'Type',
      render: (sc) => <Badge status={sc.service_type} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (sc) => <Badge status={sc.status} />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Service Operations</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Machine service requests, technician dispatch, field visits, and reports
          </p>
        </div>

        {(role === 'manager' || role === 'owner') && (
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => setIsModalOpen(true)}>
            Log New Service Call
          </Button>
        )}
      </div>

      {/* Service Workflow Progression Indicator */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Standard Workflow:</span>
        <span>Customer Profile</span>
        <ArrowRight size={14} />
        <span>Machine</span>
        <ArrowRight size={14} />
        <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Service Call</span>
        <ArrowRight size={14} />
        <span>Assign Employee</span>
        <ArrowRight size={14} />
        <span>Field Visit / Remote Support</span>
        <ArrowRight size={14} />
        <span>Service Report</span>
        <ArrowRight size={14} />
        <span>Manager Review</span>
      </div>

      <Card>
        <DataTable
          columns={columns}
          data={calls}
          keyExtractor={(sc) => sc.id}
          isLoading={isLoading}
          emptyMessage="No service calls found."
        />
      </Card>

      {/* New Service Call Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Log New Service Call Immediately"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateCall}>
              Register Call
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateCall} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Service Call ID"
              value={callCode}
              onChange={(e) => setCallCode(e.target.value)}
              required
            />
            <Select
              label="Customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              options={[
                { value: 'Apex Robotics Ltd', label: 'Apex Robotics Ltd' },
                { value: 'Omni Manufacturing Corp', label: 'Omni Manufacturing Corp' },
                { value: 'Precision BioTech Diagnostics', label: 'Precision BioTech Diagnostics' },
              ]}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Select
              label="Target Machine"
              value={machineModel}
              onChange={(e) => setMachineModel(e.target.value)}
              options={[
                { value: 'Apex CNC Mill Pro 3', label: 'Apex CNC Mill Pro 3 (SN-APEX-88219-X)' },
                { value: 'Apex Auto-Welder 500', label: 'Apex Auto-Welder 500 (SN-APEX-99104-W)' },
                { value: 'Omni Stamping Press 5000', label: 'Omni Stamping Press 5000' },
              ]}
            />

            <Select
              label="Service Method"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType)}
              options={[
                { value: 'field_visit', label: 'Field Visit (On-Site)' },
                { value: 'online_support', label: 'Online Support' },
                { value: 'phone_support', label: 'Phone Support' },
                { value: 'remote_support', label: 'Remote Diagnostics' },
              ]}
            />
          </div>

          <Select
            label="Priority Level"
            value={priority}
            onChange={(e) => setPriority(e.target.value as ServiceCallPriority)}
            options={[
              { value: 'urgent', label: 'Urgent (Production Line Down)' },
              { value: 'high', label: 'High Priority' },
              { value: 'medium', label: 'Medium Priority' },
              { value: 'low', label: 'Low Priority' },
            ]}
          />

          <Input
            label="Reported Issue Details"
            placeholder="Describe abnormal pressure, noise, sensor faults or customer symptoms"
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            required
          />
        </form>
      </Modal>
    </div>
  );
};
