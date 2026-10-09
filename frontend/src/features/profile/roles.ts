import type { Role } from '@/api/types'

const LABELS: Record<Role, string> = { owner: 'Owner', manager: 'Manager', employee: 'Employee' }
export const labelOfRole = (role: Role): string => LABELS[role]
