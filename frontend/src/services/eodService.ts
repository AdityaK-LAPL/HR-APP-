import { apiClient, isMockModeActive } from './apiClient';
import { MOCK_EOD_REPORTS } from './mockData';
import type { EodReport } from '@/types/models';
import type { PaginatedResponse } from '@/types/api';

export interface SubmitEodPayload {
  report_date: string;
  project_id?: string | null;
  task_id?: string | null;
  work_completed: string;
  work_remaining?: string | null;
  issues?: string | null;
  notes?: string | null;
}

export interface ListEodFilters {
  user_id?: string;
  project_id?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

export const eodService = {
  async submitEod(payload: SubmitEodPayload): Promise<EodReport> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 400));
      const newReport: EodReport = {
        id: `eod-${Date.now()}`,
        user_id: 'user-employee',
        user_name: 'Alex Rivera',
        report_date: payload.report_date,
        project_id: payload.project_id,
        task_id: payload.task_id,
        work_completed: payload.work_completed,
        work_remaining: payload.work_remaining,
        issues: payload.issues,
        notes: payload.notes,
        created_at: new Date().toISOString(),
      };
      MOCK_EOD_REPORTS.unshift(newReport);
      return newReport;
    }
    return apiClient.post<EodReport>('/eod', payload);
  },

  async listEod(filters: ListEodFilters = {}): Promise<PaginatedResponse<EodReport>> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 200));
      let items = [...MOCK_EOD_REPORTS];

      if (filters.user_id) {
        items = items.filter(e => e.user_id === filters.user_id);
      }
      if (filters.project_id) {
        items = items.filter(e => e.project_id === filters.project_id);
      }

      return {
        items,
        total: items.length,
        page: filters.page || 1,
        page_size: filters.page_size || 20,
      };
    }
    return apiClient.get<PaginatedResponse<EodReport>>('/eod', { params: filters as any });
  },

  async getEod(id: string): Promise<EodReport> {
    if (isMockModeActive()) {
      const item = MOCK_EOD_REPORTS.find(e => e.id === id);
      if (!item) throw new Error('EOD report not found');
      return item;
    }
    return apiClient.get<EodReport>(`/eod/${id}`);
  },
};
