import { apiClient, isMockModeActive } from './apiClient';
import { MOCK_TASKS } from './mockData';
import type { Task, TaskHistory } from '@/types/models';
import type { PaginatedResponse } from '@/types/api';
import type { TaskPriority, TaskStatus } from '@/types/enums';

export interface ListTasksFilters {
  assigned_to?: string;
  project_id?: string;
  status?: TaskStatus;
  date?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  project_id?: string | null;
  assigned_to: string;
  priority: TaskPriority;
  task_date: string;
  due_date?: string | null;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_to?: string;
  due_date?: string | null;
}

export const taskService = {
  async listTasks(filters: ListTasksFilters = {}): Promise<PaginatedResponse<Task>> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 200));
      let items = [...MOCK_TASKS];
      
      if (filters.assigned_to) {
        items = items.filter(t => t.assigned_to === filters.assigned_to);
      }
      if (filters.status) {
        items = items.filter(t => t.status === filters.status);
      }
      if (filters.project_id) {
        items = items.filter(t => t.project_id === filters.project_id);
      }
      if (filters.date) {
        items = items.filter(t => t.task_date === filters.date);
      }

      const page = filters.page || 1;
      const pageSize = filters.page_size || 20;
      const start = (page - 1) * pageSize;
      const paged = items.slice(start, start + pageSize);

      return {
        items: paged,
        total: items.length,
        page,
        page_size: pageSize,
      };
    }

    return apiClient.get<PaginatedResponse<Task>>('/tasks', { params: filters as any });
  },

  async getTask(id: string): Promise<Task> {
    if (isMockModeActive()) {
      const found = MOCK_TASKS.find(t => t.id === id);
      if (!found) throw new Error('Task not found');
      return found;
    }
    return apiClient.get<Task>(`/tasks/${id}`);
  },

  async createTask(payload: CreateTaskPayload): Promise<Task> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 300));
      const newTask: Task = {
        id: `task-${Date.now()}`,
        title: payload.title,
        description: payload.description,
        project_id: payload.project_id,
        assigned_to: payload.assigned_to,
        assigned_by: 'user-manager',
        priority: payload.priority,
        status: 'not_started',
        task_date: payload.task_date,
        due_date: payload.due_date,
        created_at: new Date().toISOString(),
      };
      MOCK_TASKS.unshift(newTask);
      return newTask;
    }
    return apiClient.post<Task>('/tasks', payload);
  },

  async updateTask(id: string, payload: UpdateTaskPayload): Promise<Task> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 200));
      const index = MOCK_TASKS.findIndex(t => t.id === id);
      if (index === -1) throw new Error('Task not found');
      MOCK_TASKS[index] = { ...MOCK_TASKS[index], ...payload, updated_at: new Date().toISOString() };
      return MOCK_TASKS[index];
    }
    return apiClient.patch<Task>(`/tasks/${id}`, payload);
  },

  async getTaskHistory(id: string): Promise<TaskHistory[]> {
    if (isMockModeActive()) {
      return [
        {
          id: 'hist-1',
          task_id: id,
          changed_by_user_id: 'user-manager',
          changed_by_name: 'David Chen',
          field_name: 'status',
          old_value: 'not_started',
          new_value: 'in_progress',
          created_at: new Date(Date.now() - 3600000).toISOString(),
        }
      ];
    }
    return apiClient.get<TaskHistory[]>(`/tasks/${id}/history`);
  },
};
