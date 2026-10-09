import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { AppConfig } from '@/api/types'
import { companyToday } from '@/lib/dates'

/** Today's date in the company timezone, from the server (falls back to the browser's clock mapped to IST). */
export function useCompanyToday(): string {
  const { data } = useQuery({
    queryKey: ['config'],
    queryFn: ({ signal }) => api.get<AppConfig>('/config', { signal }),
    staleTime: Infinity,
  })
  return data?.today ?? companyToday()
}
