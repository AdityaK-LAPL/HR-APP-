import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, apiError, employee, manager, mockSession } from '@/test/api'
import { list, spy, task } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

describe('My tasks list', () => {
  it('lists tasks with status, priority, overdue marker and who assigned them (by name)', async () => {
    mockSession(employee)
    server.use(
      http.get(`${BASE}/tasks`, () =>
        HttpResponse.json(
          list([
            task({ id: 't-1', title: 'Calibrate press line 3' }),
            task({ id: 't-2', title: 'Replace filters', status: 'in_progress', due_date: '2026-03-01' }),
          ]),
        ),
      ),
    )
    renderApp('/tasks')
    const link = await screen.findByRole('link', { name: 'Calibrate press line 3' })
    expect(link).toHaveAttribute('href', '/tasks/t-1')
    expect(await screen.findAllByText('Manny Manager')).not.toHaveLength(0)
    const table = within(screen.getByRole('table'))
    expect(table.getByText('In progress')).toBeInTheDocument()
    expect(table.getByText('Overdue')).toBeInTheDocument() // due 1 Mar, today is 5 Mar per /config
  })

  it('sends the chosen filters to the API and keeps them in the URL', async () => {
    mockSession(employee)
    const seen = spy()
    server.use(
      http.get(`${BASE}/tasks`, async ({ request }) => {
        await seen.record(request)
        return HttpResponse.json(list([]))
      }),
    )
    const { router } = renderApp('/tasks')
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Status'), 'blocked')
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('status')).toBe('blocked'))
    expect(router.state.location.search).toContain('status=blocked')

    await user.click(screen.getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(seen.seen.at(-1)?.url.searchParams.get('task_date')).toBe('2026-03-05'))
    expect(await screen.findByText('No tasks match these filters')).toBeInTheDocument()
  })

  it('explains an empty list and offers a retry after a server error', async () => {
    mockSession(employee)
    renderApp('/tasks')
    expect(await screen.findByText('No tasks assigned to you')).toBeInTheDocument()
  })

  it('shows a retryable error state when the server fails', async () => {
    mockSession(employee)
    let calls = 0
    server.use(
      http.get(`${BASE}/tasks`, () => {
        calls += 1
        return calls <= 3 ? apiError(500, 'internal_error', 'An unexpected error occurred. Reference: abc') : HttpResponse.json(list([task()]))
      }),
    )
    renderApp('/tasks')
    expect(await screen.findByText(/couldn.t load this/i, undefined, { timeout: 5000 })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('link', { name: 'Calibrate press line 3' })).toBeInTheDocument()
  })
})

describe('Task detail', () => {
  function setup(over = {}) {
    mockSession(employee)
    server.use(
      http.get(`${BASE}/tasks/t-1`, () => HttpResponse.json(task(over))),
      http.get(`${BASE}/tasks/t-1/history`, () =>
        HttpResponse.json([
          { id: 'h1', task_id: 't-1', changed_by: manager.id, field_changed: 'priority', old_value: 'low', new_value: 'high', changed_at: '2026-03-04T06:00:00Z' },
        ]),
      ),
    )
  }

  it('shows the details, who assigned it and the history by name', async () => {
    setup()
    renderApp('/tasks/t-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Calibrate press line 3' })).toBeInTheDocument()
    expect(await screen.findAllByText('Manny Manager')).not.toHaveLength(0)
    expect(await screen.findByText(/changed Priority/)).toBeInTheDocument()
  })

  it('updates only the status', async () => {
    setup()
    const seen = spy()
    server.use(
      http.patch(`${BASE}/tasks/t-1`, async ({ request }) => {
        await seen.record(request)
        return HttpResponse.json(task({ status: 'in_progress' }))
      }),
    )
    renderApp('/tasks/t-1')
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Change status'), 'in_progress')
    await user.click(screen.getByRole('button', { name: 'Save status' }))
    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toEqual({ status: 'in_progress' })
    expect(await screen.findByText(/status changed to “in progress”/i)).toBeInTheDocument()
  })

  it('asks for confirmation before completing a task, and does nothing if cancelled', async () => {
    setup()
    let patched = 0
    server.use(http.patch(`${BASE}/tasks/t-1`, () => { patched += 1; return HttpResponse.json(task({ status: 'completed' })) }))
    renderApp('/tasks/t-1')
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Change status'), 'completed')
    await user.click(screen.getByRole('button', { name: 'Save status' }))
    const dialog = await screen.findByRole('dialog', { name: /mark task as completed/i })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(patched).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Save status' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Mark completed' }))
    await waitFor(() => expect(patched).toBe(1))
  })

  it('shows the server message when the change is refused', async () => {
    setup()
    server.use(http.patch(`${BASE}/tasks/t-1`, () => apiError(403, 'forbidden', 'You can only update the status of your own tasks.')))
    renderApp('/tasks/t-1')
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Change status'), 'blocked')
    await user.click(screen.getByRole('button', { name: 'Save status' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You can only update the status of your own tasks.')
  })

  it('treats a task outside the employee\'s view as "not available"', async () => {
    mockSession(employee)
    server.use(http.get(`${BASE}/tasks/t-9`, () => apiError(404, 'not_found', 'Task not found.')), http.get(`${BASE}/tasks/t-9/history`, () => apiError(404, 'not_found', 'x')))
    renderApp('/tasks/t-9')
    expect(await screen.findByText('Not available')).toBeInTheDocument()
  })
})
