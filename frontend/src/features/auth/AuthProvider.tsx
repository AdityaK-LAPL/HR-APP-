import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { ApiError } from '@/api/errors'
import { setSessionExpiredHandler } from '@/api/client'
import type { UserProfile } from '@/api/types'
import { authApi, type ChangePasswordInput, type LoginInput } from './authApi'
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext'
import { createSessionChannel } from './sessionChannel'

interface State {
  status: AuthStatus
  user: UserProfile | null
  notice: string | null
}

type Action =
  | { type: 'signed-in'; user: UserProfile }
  | { type: 'signed-out'; notice: string | null }
  | { type: 'expired' }
  | { type: 'clear-notice' }

const SESSION_EXPIRED_NOTICE = 'Your session expired. Please sign in again.'

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'signed-in':
      return { status: 'authenticated', user: action.user, notice: null }
    case 'signed-out':
      return { status: 'anonymous', user: null, notice: action.notice }
    case 'expired':
      // Only meaningful for someone who WAS signed in; a cold start with no session is not an expiry.
      return state.status === 'authenticated'
        ? { status: 'anonymous', user: null, notice: SESSION_EXPIRED_NOTICE }
        : state.status === 'loading'
          ? { status: 'anonymous', user: null, notice: null }
          : state
    case 'clear-notice':
      return state.notice === null ? state : { ...state, notice: null }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(reducer, { status: 'loading', user: null, notice: null })
  const channel = useRef(createSessionChannel())

  // Restore the session from the httpOnly cookies (nothing identity-related lives in storage).
  useEffect(() => {
    const controller = new AbortController()
    authApi
      .me(controller.signal)
      .then((user) => dispatch({ type: 'signed-in', user }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // 401 (no/expired session) and network failures both land on the login screen.
        if (!(error instanceof ApiError)) console.error(error)
        dispatch({ type: 'signed-out', notice: null })
      })
    return () => controller.abort()
  }, [])

  // A failed refresh anywhere in the app ends the session.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      queryClient.clear()
      dispatch({ type: 'expired' })
    })
    return () => setSessionExpiredHandler(null)
  }, [queryClient])

  // Another tab logged out.
  useEffect(() => {
    const current = channel.current
    return current.onLogout(() => {
      queryClient.clear()
      dispatch({ type: 'signed-out', notice: null })
    })
  }, [queryClient])

  const login = useCallback(
    async (input: LoginInput) => {
      const user = await authApi.login(input)
      queryClient.clear() // never show a previous user's cached data
      dispatch({ type: 'signed-in', user })
      return user
    },
    [queryClient],
  )

  const signOutLocally = useCallback(
    (notice: string | null) => {
      queryClient.clear()
      dispatch({ type: 'signed-out', notice })
      channel.current.announceLogout()
    },
    [queryClient],
  )

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // The session is being abandoned either way.
    }
    signOutLocally(null)
  }, [signOutLocally])

  const changePassword = useCallback(
    async (input: ChangePasswordInput) => {
      await authApi.changePassword(input)
      signOutLocally('Password changed. Please sign in with your new password.')
    },
    [signOutLocally],
  )

  const clearNotice = useCallback(() => dispatch({ type: 'clear-notice' }), [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, changePassword, clearNotice }),
    [state, login, logout, changePassword, clearNotice],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
