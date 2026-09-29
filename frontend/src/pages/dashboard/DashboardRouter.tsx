import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { EmployeeDashboard } from './EmployeeDashboard';
import { ManagerDashboard } from './ManagerDashboard';
import { OwnerDashboard } from './OwnerDashboard';

export const DashboardRouter: React.FC = () => {
  const { role } = useAuth();

  if (role === 'owner') {
    return <OwnerDashboard />;
  }

  if (role === 'manager') {
    return <ManagerDashboard />;
  }

  return <EmployeeDashboard />;
};
