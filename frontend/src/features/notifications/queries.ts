import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Schema } from '@/api/types'
import { useAuth } from '@/features/auth/authContext'

export type Notification = Schema<'NotificationResponse'>

const POLL_MS = 60_000

export function useNotifications(unreadOnly: boolean, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['notifications', { unreadOnly }],
    queryFn: ({ signal }) =>
      api.get<Schema<'NotificationListResponse'>>('/notifications', {
        query: unreadOnly ? { unread_only: true } : {},
        signal,
      }),
    refetchInterval: POLL_MS,
  })
}

/** Unread count for the header bell; polled, and refreshed when the window regains focus. */
export function useUnreadCount() {
  const { status, user } = useAuth()
  const query = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: ({ signal }) =>
      api.get<Schema<'NotificationListResponse'>>('/notifications', { query: { unread_only: true }, signal }),
    select: (response) => response.total,
    enabled: status === 'authenticated' && user?.must_reset === false,
    refetchInterval: POLL_MS,
    // A failing poll must never break the page it sits on.
    retry: false,
  })
  return query.data
}

export function useMarkRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Notification>(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useMarkAllRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<void>('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
