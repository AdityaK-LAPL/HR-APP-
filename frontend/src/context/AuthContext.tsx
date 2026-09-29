import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService, type LoginPayload } from '@/services/authService';
import { MOCK_USERS } from '@/services/mockData';
import type { UserProfile } from '@/types/models';
import type { Role } from '@/types/enums';

interface AuthContextType {
  user: UserProfile | null;
  role: Role | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  switchMockRole: (role: Role) => void;
  can: (action: string, resource?: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const initAuth = useCallback(async () => {
    try {
      const activeUser = await authService.getMe();
      setUser(activeUser);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const login = async (payload: LoginPayload) => {
    setIsLoading(true);
    try {
      const loggedIn = await authService.login(payload);
      setUser(loggedIn);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const switchMockRole = (targetRole: Role) => {
    const mockMap: Record<Role, UserProfile> = {
      owner: MOCK_USERS['user-owner'],
      manager: MOCK_USERS['user-manager'],
      employee: MOCK_USERS['user-employee'],
    };
    const targetUser = mockMap[targetRole];
    if (targetUser) {
      localStorage.setItem('opsflow_active_user', JSON.stringify(targetUser));
      setUser(targetUser);
    }
  };

  // Client-side UX permission helper (for UI gating only; server enforces security)
  const can = (action: string, resource?: string): boolean => {
    if (!user) return false;
    if (user.role === 'owner') return true;

    if (user.role === 'manager') {
      if (action === 'create_task') return true;
      if (action === 'approve_leave') return true;
      if (action === 'assign_service') return true;
      if (action === 'create_project') return true;
      if (action === 'view_reports') return true;
      if (action === 'manage_permissions') return false; // Owner only
      if (action === 'view_audit_logs') return false; // Owner only
      return true;
    }

    if (user.role === 'employee') {
      if (action === 'punch_attendance') return true;
      if (action === 'apply_leave') return true;
      if (action === 'submit_eod') return true;
      if (action === 'submit_service_report') return true;
      if (action === 'update_task_status') return true;
      if (action === 'create_task') return false;
      if (action === 'approve_leave') return false;
      if (action === 'create_service_call') return false;
      if (action === 'view_reports') return false;
      return false;
    }

    return false;
  };

  const role = user?.role || null;
  const isAuthenticated = Boolean(user);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated,
        isLoading,
        login,
        logout,
        switchMockRole,
        can,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
