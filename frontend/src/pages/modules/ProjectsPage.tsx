import React, { useState, useEffect } from 'react';
import { projectService } from '@/services/projectService';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Briefcase, Users, Calendar } from 'lucide-react';
import type { Project } from '@/types/models';

export const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await projectService.listProjects();
        setProjects(res.items);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const columns: Column<Project>[] = [
    {
      key: 'name',
      header: 'Project Name',
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
          {p.description && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'manager_name',
      header: 'Manager',
      render: (p) => p.manager_name || 'Assigned Manager',
    },
    {
      key: 'dates',
      header: 'Timeline',
      render: (p) => `${p.start_date || 'TBD'} → ${p.expected_end_date || 'Ongoing'}`,
    },
    {
      key: 'member_count',
      header: 'Members',
      render: (p) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Users size={14} color="var(--text-muted)" />
          {p.member_count || 1} staff
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge status={p.status} />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Projects</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Company initiatives, client commissioning, and overhaul milestones
        </p>
      </div>

      <Card>
        <DataTable
          columns={columns}
          data={projects}
          keyExtractor={(p) => p.id}
          isLoading={isLoading}
          emptyMessage="No projects found."
        />
      </Card>
    </div>
  );
};
