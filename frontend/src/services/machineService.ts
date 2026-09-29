import { apiClient, isMockModeActive } from './apiClient';
import { MOCK_MACHINES } from './mockData';
import type { Machine } from '@/types/models';
import type { PaginatedResponse } from '@/types/api';
import type { MachineStatus } from '@/types/enums';

export interface ListMachinesFilters {
  customer_id?: string;
  serial_number?: string;
  model_name?: string;
  status?: MachineStatus;
  page?: number;
  page_size?: number;
}

export interface CreateMachinePayload {
  customer_id: string;
  machine_code: string;
  model_name?: string | null;
  serial_number?: string | null;
  installation_date?: string | null;
  purchase_info?: string | null;
  warranty_info?: string | null;
  location?: string | null;
}

export const machineService = {
  async listMachines(filters: ListMachinesFilters = {}): Promise<PaginatedResponse<Machine>> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 200));
      let items = [...MOCK_MACHINES];
      if (filters.customer_id) {
        items = items.filter(m => m.customer_id === filters.customer_id);
      }
      if (filters.status) {
        items = items.filter(m => m.status === filters.status);
      }
      return {
        items,
        total: items.length,
        page: filters.page || 1,
        page_size: filters.page_size || 20,
      };
    }
    return apiClient.get<PaginatedResponse<Machine>>('/machines', { params: filters as any });
  },

  async getMachine(id: string): Promise<Machine> {
    if (isMockModeActive()) {
      const m = MOCK_MACHINES.find(x => x.id === id);
      if (!m) throw new Error('Machine not found');
      return m;
    }
    return apiClient.get<Machine>(`/machines/${id}`);
  },

  async createMachine(payload: CreateMachinePayload): Promise<Machine> {
    if (isMockModeActive()) {
      const newMach: Machine = {
        id: `mach-${Date.now()}`,
        customer_id: payload.customer_id,
        machine_code: payload.machine_code,
        model_name: payload.model_name,
        serial_number: payload.serial_number,
        installation_date: payload.installation_date,
        purchase_info: payload.purchase_info,
        warranty_info: payload.warranty_info,
        location: payload.location,
        status: 'active',
        is_active: true,
        created_by: 'user-manager',
        created_at: new Date().toISOString(),
      };
      MOCK_MACHINES.unshift(newMach);
      return newMach;
    }
    return apiClient.post<Machine>('/machines', payload);
  },
};
