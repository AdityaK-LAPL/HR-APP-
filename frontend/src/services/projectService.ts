import { apiClient, isMockModeActive } from './apiClient';
import { MOCK_PROJECTS } from './mockData';
import type { Project, ProjectMember } from '@/types/models';
import type { PaginatedResponse } from '@/types/api';
import type { ProjectStatus } from '@/types/enums';

export interface ListProjectsFilters {
  status?: ProjectStatus;
  member_id?: string;
  manager_id?: string;
  page?: number;
  page_size?: number;
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  status: ProjectStatus;
  start_date?: string | null;
  expected_end_date?: string | null;
}

export const projectService = {
  async listProjects(filters: ListProjectsFilters = {}): Promise<PaginatedResponse<Project>> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 200));
      let items = [...MOCK_PROJECTS];
      if (filters.status) {
        items = items.filter(p => p.status === filters.status);
      }
      return {
        items,
        total: items.length,
        page: filters.page || 1,
        page_size: filters.page_size || 20,
      };
    }
    return apiClient.get<PaginatedResponse<Project>>('/projects', { params: filters as any });
  },

  async getProject(id: string): Promise<Project> {
    if (isMockModeActive()) {
      const p = MOCK_PROJECTS.find(x => x.id === id);
      if (!p) throw new Error('Project not found');
      return p;
    }
    return apiClient.get<Project>(`/projects/${id}`);
  },

  async createProject(payload: CreateProjectPayload): Promise<Project> {
    if (isMockModeActive()) {
      const newProj: Project = {
        id: `proj-${Date.now()}`,
        name: payload.name,
        description: payload.description,
        owning_manager_id: 'user-manager',
        manager_name: 'David Chen',
        status: payload.status,
        start_date: payload.start_date,
        expected_end_date: payload.expected_end_date,
        is_active: true,
        member_count: 1,
        created_at: new Date().toISOString(),
      };
      MOCK_PROJECTS.unshift(newProj);
      return newProj;
    }
    return apiClient.post<Project>('/projects', payload);
  },

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    if (isMockModeActive()) {
      return [
        {
          id: 'pm-1',
          project_id: projectId,
          user_id: 'user-employee',
          user_name: 'Alex Rivera',
          employee_code: 'EMP001',
          role_in_project: 'Lead Field Specialist',
          is_active: true,
          assigned_at: '2026-02-01T00:00:00Z',
        },
      ];
    }
    return apiClient.get<ProjectMember[]>(`/projects/${projectId}/members`);
  },
};
