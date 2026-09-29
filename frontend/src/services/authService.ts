import { apiClient, isMockModeActive, ApiError } from './apiClient';
import { MOCK_USERS } from './mockData';
import type { UserProfile } from '@/types/models';

export interface LoginPayload {
  employee_code: string;
  password: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export const authService = {
  async login(payload: LoginPayload): Promise<UserProfile> {
    if (isMockModeActive()) {
      // Simulate network delay
      await new Promise(r => setTimeout(r, 400));
      const code = payload.employee_code.trim().toUpperCase();
      
      const matched = Object.values(MOCK_USERS).find(
        u => u.employee_code.toUpperCase() === code
      );

      if (!matched) {
        throw new ApiError('Invalid employee ID or password', 'invalid_credentials', 401);
      }

      // Persist active mock user
      localStorage.setItem('opsflow_active_user', JSON.stringify(matched));
      return matched;
    }

    try {
      return await apiClient.post<UserProfile>('/auth/login', payload);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 500) {
        // Fallback to mock user if server/DB is down
        console.warn('Backend unavailable or DB connection pending, falling back to mock mode');
        return this.login(payload);
      }
      throw err;
    }
  },

  async getMe(): Promise<UserProfile> {
    if (isMockModeActive()) {
      const stored = localStorage.getItem('opsflow_active_user');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          // parse error
        }
      }
      // Default to employee for safety if not set
      return MOCK_USERS['user-employee'];
    }

    try {
      return await apiClient.get<UserProfile>('/auth/me');
    } catch (err) {
      if (isMockModeActive() || (err instanceof ApiError && err.status >= 500)) {
        return MOCK_USERS['user-employee'];
      }
      throw err;
    }
  },

  async logout(): Promise<void> {
    if (isMockModeActive()) {
      localStorage.removeItem('opsflow_active_user');
      return;
    }

    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore logout errors
    } finally {
      localStorage.removeItem('opsflow_active_user');
    }
  },

  async refresh(): Promise<void> {
    if (isMockModeActive()) return;
    await apiClient.post('/auth/refresh');
  },

  async changePassword(payload: ChangePasswordPayload): Promise<void> {
    if (isMockModeActive()) {
      await new Promise(r => setTimeout(r, 400));
      return;
    }
    await apiClient.post('/auth/change-password', payload);
  },
};
