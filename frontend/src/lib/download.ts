import { api, type RequestOptions } from '@/api/client'

/** A file name that is safe to hand to the browser: no folders, no characters a file system refuses. */
export function safeFilename(name: string, fallback: string): string {
  const printable = Array.from(name, (char) => (char.charCodeAt(0) < 32 ? '_' : char)).join('')
  const cleaned = printable.replace(/[\\/:*?"<>|]+/g, '_').replace(/^\.+/, '').trim()
  return cleaned || fallback
}

/** Hand a Blob to the browser as a download (no navigation, nothing stays in memory afterwards). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Fetch a file through the API client (cookies, CSRF, session refresh and error mapping all apply)
 * and save it. Throws the client's `ApiError` on failure; resolves to the name it was saved under.
 */
export async function downloadFile(path: string, options: RequestOptions, fallbackName: string): Promise<string> {
  const { blob, filename } = await api.download(path, options)
  const name = safeFilename(filename ?? '', fallbackName)
  saveBlob(blob, name)
  return name
}
