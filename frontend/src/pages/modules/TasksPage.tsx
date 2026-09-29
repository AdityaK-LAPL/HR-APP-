import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { taskService } from '@/services/taskService';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Plus, CheckSquare } from 'lucide-react';
import type { Task } from '@/types/models';
import type { TaskPriority, TaskStatus } from '@/types/enums';

export const TasksPage: React.FC = () => {
  const { role, user, can } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [taskDate, setTaskDate] = useState(new Date().toISOString().split('T')[0]);

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const res = await taskService.listTasks();
      setTasks(res.items);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await taskService.createTask({
      title: title.trim(),
      description: description.trim(),
      assigned_to: 'user-employee',
      priority,
      task_date: taskDate,
    });

    setIsModalOpen(false);
    setTitle('');
    setDescription('');
    loadTasks();
  };

  const filteredTasks = statusFilter === 'all' 
    ? tasks 
    : tasks.filter(t => t.status === statusFilter);

  const columns: Column<Task>[] = [
    {
      key: 'title',
      header: 'Task Title',
      render: (t) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</div>
          {t.description && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'assignee_name',
      header: 'Assigned To',
      render: (t) => t.assignee_name || t.assigned_to,
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (t) => <Badge status={t.priority} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => <Badge status={t.status} />,
    },
    {
      key: 'task_date',
      header: 'Date',
      render: (t) => t.task_date,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Task Management</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Track assigned daily work, deadlines, and project milestones
          </p>
        </div>

        {can('create_task') && (
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => setIsModalOpen(true)}>
            Create New Task
          </Button>
        )}
      </div>

      <Card>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
          {['all', 'not_started', 'in_progress', 'completed', 'blocked'].map(st => (
            <Button
              key={st}
              size="sm"
              variant={statusFilter === st ? 'primary' : 'outline'}
              onClick={() => setStatusFilter(st)}
              style={{ textTransform: 'capitalize' }}
            >
              {st.replace('_', ' ')}
            </Button>
          ))}
        </div>

        <DataTable
          columns={columns}
          data={filteredTasks}
          keyExtractor={(t) => t.id}
          isLoading={isLoading}
          emptyMessage="No tasks found matching current filter."
        />
      </Card>

      {/* Create Task Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create &amp; Assign Task"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateTask}>
              Save &amp; Assign
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label="Task Title"
            placeholder="e.g. Inspect hydraulic lines on Mill 3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <Input
            label="Description / Scope of Work"
            placeholder="Details, safety precautions, or checklist items"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Select
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
              ]}
            />

            <Input
              label="Scheduled Date"
              type="date"
              value={taskDate}
              onChange={(e) => setTaskDate(e.target.value)}
              required
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
