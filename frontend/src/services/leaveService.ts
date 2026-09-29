import { apiClient, isMockModeActive } from './apiClient';
import { MOCK_LEAVES } from './mockData';
import type { LeaveRequest } from '@/types/models';
import type { PaginatedResponse } from '@/types/api';
import type { LeaveStatus } from '@/types/enums';

export interface ApplyLeavePayload {
  start_date: string;
  end_date: string;
  reason: string;
}

export interface ListLeavesFilters {
  employee_id?: string;
  status?: LeaveStatus;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

export const leaveService = {
  async applyLeave(payload: ApplyLeavePayload): Promise<LeaveRequest> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 300));
      const newLeave: LeaveRequest = {
        id: `leave-${Date.now()}`,
        employee_id: 'user-employee',
        employee_name: 'Alex Rivera',
        start_date: payload.start_date,
        end_date: payload.end_date,
        reason: payload.reason,
        status: 'pending',
        current_approver_id: 'user-manager',
        approver_name: 'David Chen',
        created_at: new Date().toISOString(),
      };
      MOCK_LEAVES.unshift(newLeave);
      return newLeave;
    }
    return apiClient.post<LeaveRequest>('/leaves', payload);
  },

  async listLeaves(filters: ListLeavesFilters = {}): Promise<PaginatedResponse<LeaveRequest>> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 200));
      let items = [...MOCK_LEAVES];

      if (filters.employee_id) {
        items = items.filter(l => l.employee_id === filters.employee_id);
      }
      if (filters.status) {
        items = items.filter(l => l.status === filters.status);
      }

      return {
        items,
        total: items.length,
        page: filters.page || 1,
        page_size: filters.page_size || 20,
      };
    }
    return apiClient.get<PaginatedResponse<LeaveRequest>>('/leaves', { params: filters as any });
  },

  async approveLeave(id: string, comments?: string): Promise<LeaveRequest> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 300));
      const item = MOCK_LEAVES.find(l => l.id === id);
      if (!item) throw new Error('Leave request not found');
      item.status = 'approved';
      item.comments = comments || 'Approved by Manager';
      return item;
    }
    return apiClient.post<LeaveRequest>(`/leaves/${id}/approve`, { comments });
  },

  async rejectLeave(id: string, comments: string): Promise<LeaveRequest> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 300));
      const item = MOCK_LEAVES.find(l => l.id === id);
      if (!item) throw new Error('Leave request not found');
      item.status = 'rejected';
      item.comments = comments;
      return item;
    }
    return apiClient.post<LeaveRequest>(`/leaves/${id}/reject`, { comments });
  },

  async cancelLeave(id: string): Promise<LeaveRequest> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 300));
      const item = MOCK_LEAVES.find(l => l.id === id);
      if (!item) throw new Error('Leave request not found');
      item.status = 'cancelled';
      return item;
    }
    return apiClient.post<LeaveRequest>(`/leaves/${id}/cancel`);
  },
};
