import { createContext, useContext } from 'react'
import type { UserProfile } from '@/api/types'
import type { ChangePasswordInput, LoginInput } from './authApi'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthContextValue {
  status: AuthStatus
  /** The signed-in user (never persisted to browser storage); null unless authenticated. */
  user: UserProfile | null
  /** One-shot message for the login screen ("session expired", "password changed"...). */
  notice: string | null
  login: (input: LoginInput) => Promise<UserProfile>
  logout: () => Promise<void>
  /** Changes the password; the server revokes every session, so this signs the user out. */
  changePassword: (input: ChangePasswordInput) => Promise<void>
  clearNotice: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
