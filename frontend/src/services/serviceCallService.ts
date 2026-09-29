import { apiClient, isMockModeActive } from './apiClient';
import { MOCK_SERVICE_CALLS } from './mockData';
import type {
  ServiceCall,
  ServiceAssignment,
  ServiceVisit,
  ServiceReport,
} from '@/types/models';
import type { PaginatedResponse } from '@/types/api';
import type {
  ServiceCallPriority,
  ServiceCallStatus,
  ServiceType,
  ContactMethod,
  ServiceVisitType,
} from '@/types/enums';

export interface ListServiceCallsFilters {
  customer_id?: string;
  machine_id?: string;
  employee_id?: string;
  manager_id?: string;
  status?: ServiceCallStatus;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface CreateServiceCallPayload {
  service_call_code: string;
  customer_id: string;
  machine_id: string;
  contacted_at: string;
  contact_method: ContactMethod;
  issue_reported: string;
  priority: ServiceCallPriority;
  service_type: ServiceType;
  responsible_manager_id?: string;
}

export interface RecordVisitPayload {
  visit_type: ServiceVisitType;
  visit_date: string;
  arrival_time?: string | null;
  departure_time?: string | null;
  work_performed: string;
  problem_found?: string | null;
  parts_used?: string | null;
  action_taken?: string | null;
  result?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SubmitReportPayload {
  service_visit_id?: string | null;
  report_datetime: string;
  work_performed: string;
  problem_found: string;
  root_cause?: string | null;
  action_taken: string;
  parts_used?: string | null;
  result: string;
  pending_work?: string | null;
  recommendations?: string | null;
  employee_comments?: string | null;
}

export const serviceCallService = {
  async listServiceCalls(filters: ListServiceCallsFilters = {}): Promise<PaginatedResponse<ServiceCall>> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 200));
      let items = [...MOCK_SERVICE_CALLS];
      if (filters.status) {
        items = items.filter(sc => sc.status === filters.status);
      }
      if (filters.customer_id) {
        items = items.filter(sc => sc.customer_id === filters.customer_id);
      }
      if (filters.machine_id) {
        items = items.filter(sc => sc.machine_id === filters.machine_id);
      }
      return {
        items,
        total: items.length,
        page: filters.page || 1,
        page_size: filters.page_size || 20,
      };
    }
    return apiClient.get<PaginatedResponse<ServiceCall>>('/service-calls', { params: filters as any });
  },

  async getServiceCall(id: string): Promise<ServiceCall> {
    if (isMockModeActive()) {
      const sc = MOCK_SERVICE_CALLS.find(x => x.id === id);
      if (!sc) throw new Error('Service call not found');
      return sc;
    }
    return apiClient.get<ServiceCall>(`/service-calls/${id}`);
  },

  async createServiceCall(payload: CreateServiceCallPayload): Promise<ServiceCall> {
    if (isMockModeActive()) {
      const newCall: ServiceCall = {
        id: `sc-${Date.now()}`,
        service_call_code: payload.service_call_code,
        customer_id: payload.customer_id,
        customer_name: 'Apex Robotics Ltd',
        machine_id: payload.machine_id,
        machine_model: 'Apex CNC Mill Pro 3',
        machine_serial: 'SN-APEX-88219-X',
        contacted_at: payload.contacted_at,
        contact_method: payload.contact_method,
        issue_reported: payload.issue_reported,
        priority: payload.priority,
        service_type: payload.service_type,
        responsible_manager_id: payload.responsible_manager_id || 'user-manager',
        status: 'new',
        created_at: new Date().toISOString(),
      };
      MOCK_SERVICE_CALLS.unshift(newCall);
      return newCall;
    }
    return apiClient.post<ServiceCall>('/service-calls', payload);
  },

  async listAssignments(serviceCallId: string): Promise<ServiceAssignment[]> {
    if (isMockModeActive()) {
      return [
        {
          id: 'sa-1',
          service_call_id: serviceCallId,
          employee_id: 'user-employee',
          employee_name: 'Alex Rivera',
          assigned_by: 'user-manager',
          assigned_at: new Date(Date.now() - 3600000 * 4).toISOString(),
          role_in_call: 'Lead Field Engineer',
          is_active: true,
        },
      ];
    }
    return apiClient.get<ServiceAssignment[]>(`/service-calls/${serviceCallId}/assignments`);
  },

  async assignEmployee(serviceCallId: string, employeeId: string, roleInCall?: string): Promise<ServiceAssignment> {
    if (isMockModeActive()) {
      return {
        id: `sa-${Date.now()}`,
        service_call_id: serviceCallId,
        employee_id: employeeId,
        employee_name: 'Alex Rivera',
        assigned_by: 'user-manager',
        assigned_at: new Date().toISOString(),
        role_in_call: roleInCall || 'Assigned Engineer',
        is_active: true,
      };
    }
    return apiClient.post<ServiceAssignment>(`/service-calls/${serviceCallId}/assign`, {
      employee_id: employeeId,
      role_in_call: roleInCall,
    });
  },

  async recordVisit(serviceCallId: string, payload: RecordVisitPayload): Promise<ServiceVisit> {
    if (isMockModeActive()) {
      return {
        id: `sv-${Date.now()}`,
        service_call_id: serviceCallId,
        visit_type: payload.visit_type,
        visit_date: payload.visit_date,
        arrival_time: payload.arrival_time,
        departure_time: payload.departure_time,
        work_performed: payload.work_performed,
        problem_found: payload.problem_found,
        parts_used: payload.parts_used,
        action_taken: payload.action_taken,
        result: payload.result,
        created_by: 'user-employee',
        created_at: new Date().toISOString(),
      };
    }
    return apiClient.post<ServiceVisit>(`/service-calls/${serviceCallId}/visits`, payload);
  },

  async submitReport(serviceCallId: string, payload: SubmitReportPayload): Promise<ServiceReport> {
    if (isMockModeActive()) {
      return {
        id: `sr-${Date.now()}`,
        service_call_id: serviceCallId,
        service_visit_id: payload.service_visit_id,
        report_datetime: payload.report_datetime,
        work_performed: payload.work_performed,
        problem_found: payload.problem_found,
        root_cause: payload.root_cause,
        action_taken: payload.action_taken,
        parts_used: payload.parts_used,
        result: payload.result,
        pending_work: payload.pending_work,
        recommendations: payload.recommendations,
        employee_comments: payload.employee_comments,
        author_id: 'user-employee',
        author_name: 'Alex Rivera',
        created_at: new Date().toISOString(),
      };
    }
    return apiClient.post<ServiceReport>(`/service-calls/${serviceCallId}/report`, payload);
  },

  async reviewReport(reportId: string, comments?: string): Promise<ServiceReport> {
    if (isMockModeActive()) {
      return {
        id: reportId,
        service_call_id: 'sc-1',
        report_datetime: new Date().toISOString(),
        work_performed: 'Completed inspection and seal replacement',
        problem_found: 'Worn seals',
        action_taken: 'Replaced parts',
        result: 'Resolved',
        author_id: 'user-employee',
        author_name: 'Alex Rivera',
        reviewed_by: 'user-manager',
        reviewed_at: new Date().toISOString(),
        review_comments: comments || 'Reviewed and approved.',
        created_at: new Date().toISOString(),
      };
    }
    return apiClient.post<ServiceReport>(`/service-reports/${reportId}/review`, { comments });
  },
};
