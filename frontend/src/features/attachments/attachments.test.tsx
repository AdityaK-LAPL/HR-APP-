import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, manager, mockSession } from '@/test/api'
import { task } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const file = { id: 'f-1', entity_type: 'task', entity_id: 't-1', original_filename: 'torque-log.pdf', mime_type: 'application/pdf', size_bytes: 2048, uploaded_by: manager.id, created_at: '2026-03-05T05:00:00Z' }

function setup() {
  mockSession(employee)
  server.use(
    http.get(`${BASE}/tasks/t-1`, () => HttpResponse.json(task())),
    http.get(`${BASE}/tasks/t-1/history`, () => HttpResponse.json([])),
  )
}

describe('Attachments on a task', () => {
  it('lists files with size, uploader name and a download link through the API', async () => {
    setup()
    server.use(http.get(`${BASE}/attachments`, () => HttpResponse.json({ items: [file] })))
    renderApp('/tasks/t-1')
    expect(await screen.findByText('torque-log.pdf')).toBeInTheDocument()
    expect(screen.getByText('2 KB')).toBeInTheDocument()
    const download = screen.getByRole('link', { name: 'Download torque-log.pdf' })
    expect(download).toHaveAttribute('href', `${BASE}/attachments/f-1/download`)
  })

  it('uploads a file as multipart with the entity it belongs to', async () => {
    setup()
    let uploaded: FormData | null = null
    server.use(
      http.get(`${BASE}/attachments`, () => HttpResponse.json({ items: [] })),
      http.post(`${BASE}/attachments`, async ({ request }) => {
        uploaded = await request.formData()
        return HttpResponse.json({ ...file, download_url: '/x' }, { status: 201 })
      }),
    )
    renderApp('/tasks/t-1')
    const input = await screen.findByLabelText(/choose a file to attach/i)
    await userEvent.setup().upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }))
    await waitFor(() => expect(uploaded).not.toBeNull())
    const form = uploaded as unknown as FormData
    expect(form.get('entity_type')).toBe('task')
    expect(form.get('entity_id')).toBe('t-1')
    // (jsdom's File is not Node-fetch-native, so the bytes are verified in the real-browser run)
    expect(form.has('file')).toBe(true)
    expect(await screen.findByText('notes.txt uploaded.')).toBeInTheDocument()
  })

  it('shows the server\'s reason when an upload is rejected', async () => {
    setup()
    server.use(
      http.get(`${BASE}/attachments`, () => HttpResponse.json({ items: [] })),
      http.post(`${BASE}/attachments`, () => apiError(422, 'validation_failed', 'File type ".exe" is not allowed.')),
    )
    renderApp('/tasks/t-1')
    await userEvent.setup().upload(await screen.findByLabelText(/choose a file to attach/i), new File(['x'], 'run.exe'))
    expect(await screen.findByText('File type ".exe" is not allowed.')).toBeInTheDocument()
  })

  it('removes a file only after confirmation', async () => {
    setup()
    let removed = 0
    server.use(
      http.get(`${BASE}/attachments`, () => HttpResponse.json({ items: [file] })),
      http.delete(`${BASE}/attachments/f-1`, () => { removed += 1; return new HttpResponse(null, { status: 204 }) }),
    )
    renderApp('/tasks/t-1')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Remove torque-log.pdf' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove attachment' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(removed).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Remove torque-log.pdf' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(removed).toBe(1))
  })
})
