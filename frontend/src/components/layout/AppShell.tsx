import { Outlet } from 'react-router-dom'
import { InstallBanner } from '@/components/feedback/InstallBanner'
import { UpdatePrompt } from '@/components/feedback/UpdatePrompt'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'

export function AppShell() {
  return (
    <div className="app-container">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Sidebar />
      <div className="main-content">
        <UpdatePrompt />
        <Header />
        <main id="main-content" className="page-wrapper" tabIndex={-1}>
          <Outlet />
        </main>
        <MobileNav />
        <InstallBanner />
      </div>
    </div>
  )
}
