import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '@/api/client'
import type { AppConfig } from '@/api/types'
import { setCompanyTimezone } from '@/lib/dates'

/** Fetches GET /config once (public) and points the date helpers at the company timezone. */
export function CompanyConfigSync() {
  const { data } = useQuery({
    queryKey: ['config'],
    queryFn: ({ signal }) => api.get<AppConfig>('/config', { signal }),
    staleTime: Infinity,
  })
  useEffect(() => {
    if (data) setCompanyTimezone(data.company_timezone)
  }, [data])
  return null
}
