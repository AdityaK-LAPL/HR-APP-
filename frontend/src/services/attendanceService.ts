import { apiClient, isMockModeActive } from './apiClient';
import { MOCK_ATTENDANCE_DAYS } from './mockData';
import type { AttendanceDay, AttendanceEvent } from '@/types/models';
import type { PaginatedResponse } from '@/types/api';

export interface PunchPayload {
  latitude?: number;
  longitude?: number;
}

export interface ListAttendanceFilters {
  user_id?: string;
  manager_id?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

export const attendanceService = {
  async punchIn(payload: PunchPayload = {}): Promise<AttendanceDay> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 400));
      const today = new Date().toISOString().split('T')[0];
      const existing = MOCK_ATTENDANCE_DAYS.find(
        d => d.user_id === 'user-employee' && d.work_date === today
      );

      const locationStr = payload.latitude && payload.longitude 
        ? `${payload.latitude.toFixed(4)}° N, ${payload.longitude.toFixed(4)}° E` 
        : 'GPS Verified (Mobile Device)';

      if (existing) {
        existing.punch_in_at = new Date().toISOString();
        existing.punch_in_location = locationStr;
        existing.status = 'present';
        return existing;
      }

      const newRecord: AttendanceDay = {
        id: `att-${Date.now()}`,
        user_id: 'user-employee',
        user_name: 'Alex Rivera',
        work_date: today,
        punch_in_at: new Date().toISOString(),
        punch_out_at: null,
        punch_in_location: locationStr,
        punch_out_location: null,
        total_duration_minutes: 0,
        status: 'present',
      };
      MOCK_ATTENDANCE_DAYS.unshift(newRecord);
      return newRecord;
    }

    return apiClient.post<AttendanceDay>('/attendance/punch-in', payload);
  },

  async punchOut(payload: PunchPayload = {}): Promise<AttendanceDay> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 400));
      const today = new Date().toISOString().split('T')[0];
      const record = MOCK_ATTENDANCE_DAYS.find(
        d => d.user_id === 'user-employee' && d.work_date === today
      );

      const locationStr = payload.latitude && payload.longitude 
        ? `${payload.latitude.toFixed(4)}° N, ${payload.longitude.toFixed(4)}° E` 
        : 'GPS Verified (Mobile Device)';

      if (record) {
        record.punch_out_at = new Date().toISOString();
        record.punch_out_location = locationStr;
        record.total_duration_minutes = 480; // 8 hours
        return record;
      }

      const newRecord: AttendanceDay = {
        id: `att-${Date.now()}`,
        user_id: 'user-employee',
        user_name: 'Alex Rivera',
        work_date: today,
        punch_in_at: new Date(Date.now() - 3600000 * 8).toISOString(),
        punch_out_at: new Date().toISOString(),
        punch_in_location: locationStr,
        punch_out_location: locationStr,
        total_duration_minutes: 480,
        status: 'present',
      };
      MOCK_ATTENDANCE_DAYS.unshift(newRecord);
      return newRecord;
    }

    return apiClient.post<AttendanceDay>('/attendance/punch-out', payload);
  },

  async listAttendance(filters: ListAttendanceFilters = {}): Promise<PaginatedResponse<AttendanceDay>> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 200));
      let items = [...MOCK_ATTENDANCE_DAYS];

      if (filters.user_id) {
        items = items.filter(a => a.user_id === filters.user_id);
      }

      return {
        items,
        total: items.length,
        page: filters.page || 1,
        page_size: filters.page_size || 20,
      };
    }

    return apiClient.get<PaginatedResponse<AttendanceDay>>('/attendance', { params: filters as any });
  },

  async getAttendanceEvents(userId: string, workDate: string): Promise<AttendanceEvent[]> {
    if (isMockModeActive()) {
      return [
        {
          id: 'evt-1',
          user_id: userId,
          event_type: 'punch_in',
          event_timestamp: `${workDate}T09:00:00Z`,
          created_at: `${workDate}T09:00:00Z`,
        },
      ];
    }
    return apiClient.get<AttendanceEvent[]>(`/attendance/${userId}/${workDate}/events`);
  },
};
