import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { createQueryClient } from '@/api/queryClient'
import { OfflineBanner } from '@/components/feedback/OfflineBanner'
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
          {children}
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
