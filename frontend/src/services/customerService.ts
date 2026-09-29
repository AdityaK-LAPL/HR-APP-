import { apiClient, isMockModeActive } from './apiClient';
import { MOCK_CUSTOMERS } from './mockData';
import type { Customer, CustomerContact } from '@/types/models';
import type { PaginatedResponse } from '@/types/api';

export interface ListCustomersFilters {
  name?: string;
  customer_code?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface CreateCustomerPayload {
  customer_code: string;
  name: string;
  address?: string | null;
  notes?: string | null;
}

export const customerService = {
  async listCustomers(filters: ListCustomersFilters = {}): Promise<PaginatedResponse<Customer>> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 200));
      let items = [...MOCK_CUSTOMERS];
      if (filters.search) {
        const q = filters.search.toLowerCase();
        items = items.filter(
          c => c.name.toLowerCase().includes(q) || c.customer_code.toLowerCase().includes(q)
        );
      }
      return {
        items,
        total: items.length,
        page: filters.page || 1,
        page_size: filters.page_size || 20,
      };
    }
    return apiClient.get<PaginatedResponse<Customer>>('/customers', { params: filters as any });
  },

  async getCustomer(id: string): Promise<Customer> {
    if (isMockModeActive()) {
      const c = MOCK_CUSTOMERS.find(x => x.id === id);
      if (!c) throw new Error('Customer not found');
      return c;
    }
    return apiClient.get<Customer>(`/customers/${id}`);
  },

  async createCustomer(payload: CreateCustomerPayload): Promise<Customer> {
    if (isMockModeActive()) {
      const newCust: Customer = {
        id: `cust-${Date.now()}`,
        customer_code: payload.customer_code,
        name: payload.name,
        address: payload.address,
        notes: payload.notes,
        is_active: true,
        created_by: 'user-manager',
        machines_count: 0,
        created_at: new Date().toISOString(),
      };
      MOCK_CUSTOMERS.unshift(newCust);
      return newCust;
    }
    return apiClient.post<Customer>('/customers', payload);
  },

  async listContacts(customerId: string): Promise<CustomerContact[]> {
    if (isMockModeActive()) {
      return [
        {
          id: 'contact-1',
          customer_id: customerId,
          name: 'Mr. Arvind Rao',
          phone: '+91 98450 11223',
          email: 'arao@apexrobotics.in',
          designation: 'VP Operations',
          is_primary: true,
        },
      ];
    }
    return apiClient.get<CustomerContact[]>(`/customers/${customerId}/contacts`);
  },
};
