import React from 'react';
import { Outlet } from 'react-router-dom';
import { DesktopSidebar } from './DesktopSidebar';
import { Header } from './Header';
import { MobileNavBar } from './MobileNavBar';
import { InstallBanner } from '@/components/feedback/InstallBanner';

export const AppShell: React.FC = () => {
  return (
    <div className="app-container">
      {/* Desktop Navigation Sidebar (>= 1024px) */}
      <DesktopSidebar />

      {/* Main Content Area */}
      <div className="main-content">
        <Header />

        <main className="page-wrapper">
          <Outlet />
        </main>

        {/* Mobile Fixed Bottom Navigation (< 1024px) */}
        <MobileNavBar />

        {/* 1-Click PWA Install Promotion Banner */}
        <InstallBanner />
      </div>
    </div>
  );
};
