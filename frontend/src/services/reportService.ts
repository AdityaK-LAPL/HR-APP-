import { apiClient, isMockModeActive } from './apiClient';

export interface AttendanceReportRow {
  user_id: string;
  user_name: string;
  days_present: number;
  total_minutes: number;
}

export interface TaskStatusReport {
  status: string;
  count: number;
}

export interface LeaveReportRow {
  status: string;
  count: number;
}

export interface WorkloadRow {
  user_id: string;
  user_name: string;
  open_task_count: number;
  active_service_assignment_count: number;
}

export interface ServiceActivityReport {
  counts_by_status: Record<string, number>;
  average_resolution_minutes: number | null;
}

export const reportService = {
  async getAttendanceReport(): Promise<AttendanceReportRow[]> {
    if (isMockModeActive()) {
      return [
        { user_id: 'user-employee', user_name: 'Alex Rivera', days_present: 21, total_minutes: 10080 },
        { user_id: 'user-employee-2', user_name: 'Priya Patel', days_present: 19, total_minutes: 9120 },
        { user_id: 'user-manager', user_name: 'David Chen', days_present: 22, total_minutes: 10560 },
      ];
    }
    return apiClient.get<AttendanceReportRow[]>('/reports/attendance');
  },

  async getTasksReport(): Promise<TaskStatusReport[]> {
    if (isMockModeActive()) {
      return [
        { status: 'completed', count: 18 },
        { status: 'in_progress', count: 7 },
        { status: 'not_started', count: 4 },
        { status: 'blocked', count: 1 },
      ];
    }
    return apiClient.get<TaskStatusReport[]>('/reports/tasks');
  },

  async getLeaveReport(): Promise<LeaveReportRow[]> {
    if (isMockModeActive()) {
      return [
        { status: 'pending', count: 2 },
        { status: 'approved', count: 9 },
        { status: 'rejected', count: 1 },
      ];
    }
    return apiClient.get<LeaveReportRow[]>('/reports/leave');
  },

  async getWorkloadReport(): Promise<WorkloadRow[]> {
    if (isMockModeActive()) {
      return [
        { user_id: 'user-employee', user_name: 'Alex Rivera', open_task_count: 3, active_service_assignment_count: 2 },
        { user_id: 'user-employee-2', user_name: 'Priya Patel', open_task_count: 1, active_service_assignment_count: 1 },
        { user_id: 'user-manager', user_name: 'David Chen', open_task_count: 2, active_service_assignment_count: 0 },
      ];
    }
    return apiClient.get<WorkloadRow[]>('/reports/workload');
  },

  async getServiceActivityReport(): Promise<ServiceActivityReport> {
    if (isMockModeActive()) {
      return {
        counts_by_status: {
          new: 2,
          assigned: 3,
          in_progress: 4,
          resolved: 14,
          closed: 28,
        },
        average_resolution_minutes: 240,
      };
    }
    return apiClient.get<ServiceActivityReport>('/reports/service-activity');
  },
};
