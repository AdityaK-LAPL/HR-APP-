import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from './ProtectedRoute';

// Pages
import { LoginPage } from '@/pages/auth/LoginPage';
import { DashboardRouter } from '@/pages/dashboard/DashboardRouter';
import { TasksPage } from '@/pages/modules/TasksPage';
import { AttendancePage } from '@/pages/modules/AttendancePage';
import { LeavesPage } from '@/pages/modules/LeavesPage';
import { EodPage } from '@/pages/modules/EodPage';
import { ProjectsPage } from '@/pages/modules/ProjectsPage';
import { ServicePage } from '@/pages/modules/ServicePage';
import { CustomersPage } from '@/pages/modules/CustomersPage';
import { MachinesPage } from '@/pages/modules/MachinesPage';
import { CalendarPage } from '@/pages/modules/CalendarPage';
import { ReportsPage } from '@/pages/modules/ReportsPage';
import { PermissionsPage } from '@/pages/modules/PermissionsPage';
import { AuditLogsPage } from '@/pages/modules/AuditLogsPage';
import { UsersPage } from '@/pages/modules/UsersPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<LoginPage />} />

      {/* Authenticated Application Shell */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardRouter />} />

        {/* Core Modules */}
        <Route path="tasks" element={<TasksPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="leaves" element={<LeavesPage />} />
        <Route path="eod" element={<EodPage />} />
        <Route path="projects" element={<ProjectsPage />} />

        {/* Service Operations */}
        <Route path="service" element={<ServicePage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="machines" element={<MachinesPage />} />
        <Route path="calendar" element={<CalendarPage />} />

        {/* Governance & Management (Role scoped in UI) */}
        <Route path="reports" element={<ReportsPage />} />
        <Route
          path="permissions"
          element={
            <ProtectedRoute allowedRoles={['owner']}>
              <PermissionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="audit-logs"
          element={
            <ProtectedRoute allowedRoles={['owner']}>
              <AuditLogsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="users"
          element={
            <ProtectedRoute allowedRoles={['owner', 'manager']}>
              <UsersPage />
            </ProtectedRoute>
          }
        />

        {/* 404 Fallback */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};
