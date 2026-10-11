import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { createQueryClient } from '@/api/queryClient'
import { OfflineBanner } from '@/components/feedback/OfflineBanner'
import { UpdatePrompt } from '@/components/feedback/UpdatePrompt'
import { ToastProvider } from '@/components/feedback/ToastProvider'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { CompanyConfigSync } from '@/features/CompanyConfigSync'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <CompanyConfigSync />
          <OfflineBanner />
          {/* Registers the service worker for EVERY page (the login screen is part of the installable shell) and offers new versions. */}
          <UpdatePrompt />
          {children}
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
