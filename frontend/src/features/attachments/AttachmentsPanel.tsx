import { Download, Paperclip, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { ApiError } from '@/api/errors'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { useToast } from '@/components/feedback/toastContext'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Section } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { usePeople } from '@/features/people/usePeople'
import { formatDateTime } from '@/lib/dates'
import {
  attachmentDownloadUrl,
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
  type AttachableType,
  type Attachment,
} from './queries'

function formatSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Files attached to one record. Anyone who can see the record sees the list; `canUpload` only
 * decides whether the upload control is shown - the server still refuses uploads and deletes the
 * caller is not allowed to make (its message is shown as-is).
 */
export function AttachmentsPanel({
  entityType,
  entityId,
  canUpload = false,
  title = 'Attachments',
}: {
  entityType: AttachableType
  entityId: string
  canUpload?: boolean
  title?: string
}) {
  const toast = useToast()
  const query = useAttachments(entityType, entityId)
  const upload = useUploadAttachment(entityType, entityId)
  const remove = useDeleteAttachment(entityType, entityId)
  const fileInput = useRef<HTMLInputElement>(null)
  const [toDelete, setToDelete] = useState<Attachment | null>(null)
  const { nameOf } = usePeople((query.data ?? []).map((file) => file.uploaded_by))

  const onPick = (file: File | undefined) => {
    if (!file) return
    upload.mutate(file, {
      onSuccess: () => toast.success(`${file.name} uploaded.`),
      onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Upload failed.', 'Upload failed'),
    })
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <Section
      title={title}
      action={
        canUpload ? (
          <>
            <input
              ref={fileInput}
              type="file"
              className="visually-hidden"
              aria-label={`Choose a file to attach to ${title.toLowerCase()}`}
              onChange={(event) => onPick(event.target.files?.[0])}
            />
            <Button
              size="sm"
              variant="outline"
              icon={<Upload size={16} />}
              loading={upload.isPending}
              onClick={() => fileInput.current?.click()}
            >
              Upload file
            </Button>
          </>
        ) : undefined
      }
    >
      <QueryBoundary
        query={query}
        skeleton={<Skeleton height={44} />}
        isEmpty={(files) => files.length === 0}
        empty={
          <p style={{ fontSize: 14 }}>
            <Paperclip size={14} aria-hidden="true" /> No files attached yet.
          </p>
        }
      >
        {(files) => (
          <ul style={{ listStyle: 'none' }}>
            {files.map((file) => (
              <li key={file.id} className="file-row">
                <div className="file-name">
                  <strong>{file.original_filename}</strong>
                  <div className="meta-line">
                    <span>{formatSize(file.size_bytes)}</span>
                    <span>
                      {nameOf(file.uploaded_by, '…')} · {formatDateTime(file.created_at)}
                    </span>
                  </div>
                </div>
                <a
                  className="btn btn-outline btn-sm"
                  href={attachmentDownloadUrl(file.id)}
                  download={file.original_filename}
                  aria-label={`Download ${file.original_filename}`}
                >
                  <Download size={16} aria-hidden="true" /> Download
                </a>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${file.original_filename}`}
                  onClick={() => setToDelete(file)}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>

      <ConfirmDialog
        open={toDelete !== null}
        tone="danger"
        title="Remove attachment"
        message={
          <>
            Remove <strong>{toDelete?.original_filename}</strong> from this record? It will no longer be listed.
          </>
        }
        confirmLabel="Remove"
        busy={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (!toDelete) return
          remove.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success('Attachment removed.')
              setToDelete(null)
            },
            onError: (error) => {
              toast.error(error instanceof ApiError ? error.message : 'Could not remove the file.')
              setToDelete(null)
            },
          })
        }}
      />
    </Section>
  )
}
