import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
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
  | { type: 'unreachable' }
  | { type: 'restoring' }
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
    case 'unreachable':
      // Only a cold start can be unreachable; someone already signed in keeps their session.
      return state.status === 'loading' ? { ...state, status: 'unreachable' } : state
    case 'restoring':
      return state.status === 'unreachable' ? { ...state, status: 'loading' } : state
    case 'clear-notice':
      return state.notice === null ? state : { ...state, notice: null }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(reducer, { status: 'loading', user: null, notice: null })
  const channel = useRef(createSessionChannel())

  // Restore the session from the httpOnly cookies (nothing identity-related lives in storage).
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    authApi
      .me(controller.signal)
      .then((user) => dispatch({ type: 'signed-in', user }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // A 401 means there is no session. A server we could not reach - or one that is failing -
        // says nothing about the session: an installed app opened offline, or during an outage,
        // must not behave as if the user signed out.
        if (error instanceof ApiError && (error.isNetworkError || error.status >= 500)) {
          dispatch({ type: 'unreachable' })
          return
        }
        if (!(error instanceof ApiError)) console.error(error)
        dispatch({ type: 'signed-out', notice: null })
      })
    return () => controller.abort()
  }, [attempt])

  const retrySession = useCallback(() => {
    dispatch({ type: 'restoring' })
    setAttempt((n) => n + 1)
  }, [])

  // The moment the connection returns, try again by itself; the timer covers
  // browsers that never fire 'online' (a server that was merely down).
  useEffect(() => {
    if (state.status !== 'unreachable') return
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') retrySession()
    }, 20_000)
    window.addEventListener('online', retrySession)
    return () => {
      window.clearInterval(poll)
      window.removeEventListener('online', retrySession)
    }
  }, [state.status, retrySession])

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
    () => ({ ...state, login, logout, changePassword, clearNotice, retrySession }),
    [state, login, logout, changePassword, clearNotice, retrySession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
