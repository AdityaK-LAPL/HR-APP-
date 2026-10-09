import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_BASE, api } from '@/api/client'
import type { Schema } from '@/api/types'

export type Attachment = Schema<'AttachmentResponse'>
export type AttachableType = Attachment['entity_type']

export const attachmentKeys = {
  list: (type: AttachableType, id: string) => ['attachments', type, id] as const,
}

export function useAttachments(entityType: AttachableType, entityId: string) {
  return useQuery({
    queryKey: attachmentKeys.list(entityType, entityId),
    queryFn: ({ signal }) =>
      api
        .get<Schema<'AttachmentListResponse'>>('/attachments', {
          query: { entity_type: entityType, entity_id: entityId },
          signal,
        })
        .then((response) => response.items),
  })
}

export function useUploadAttachment(entityType: AttachableType, entityId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.set('entity_type', entityType)
      form.set('entity_id', entityId)
      form.set('file', file)
      return api.upload<Schema<'AttachmentWithUrlResponse'>>('/attachments', form)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: attachmentKeys.list(entityType, entityId) }),
  })
}

export function useDeleteAttachment(entityType: AttachableType, entityId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/attachments/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: attachmentKeys.list(entityType, entityId) }),
  })
}

/** Streams through the API with the session cookie (works for local and Supabase storage). */
export function attachmentDownloadUrl(id: string): string {
  return `${API_BASE}/attachments/${id}/download`
}
