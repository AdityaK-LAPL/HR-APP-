import { api } from '@/api/client'
import type { UserProfile } from '@/api/types'

export interface LoginInput {
  employee_code: string
  password: string
}

export interface ChangePasswordInput {
  current_password: string
  new_password: string
}

export const authApi = {
  /** Never triggers a refresh: a 401 here means "wrong credentials". */
  login: (input: LoginInput, signal?: AbortSignal) =>
    api.post<UserProfile>('/auth/login', input, { skipRefresh: true, signal }),
  me: (signal?: AbortSignal) => api.get<UserProfile>('/auth/me', { signal }),
  logout: () => api.post<void>('/auth/logout', undefined, { skipRefresh: true }),
  changePassword: (input: ChangePasswordInput) =>
    api.post<void>('/auth/change-password', input),
}
