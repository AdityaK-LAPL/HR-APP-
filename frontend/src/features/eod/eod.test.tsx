import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BASE, employee, mockSession } from '@/test/api'
import { list, spy, task } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const report = {
  id: 'e-1', user_id: employee.id, report_date: '2026-03-05', project_id: 'p-1', task_id: null,
  work_completed: 'Finished the calibration.', work_remaining: 'Final sign-off', issues: null, notes: null,
  submitted_at: '2026-03-05T12:00:00Z',
}
const project = {
  id: 'p-1', name: 'Plant upgrade', description: null, owning_manager_id: 'm', status: 'in_progress',
  start_date: null, expected_end_date: null, actual_end_date: null, is_active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

describe('EOD reports', () => {
  it('lists submitted reports and links to each', async () => {
    mockSession(employee)
    server.use(
      http.get(`${BASE}/eod`, () => HttpResponse.json(list([report]))),
      http.get(`${BASE}/projects`, () => HttpResponse.json(list([project]))),
    )
    renderApp('/eod')
    const link = await screen.findByRole('link', { name: '05 Mar 2026' })
    expect(link).toHaveAttribute('href', '/eod/e-1')
    expect(await screen.findByText('Plant upgrade')).toBeInTheDocument()
    expect(screen.getByText('Finished the calibration.')).toBeInTheDocument()
  })

  it('submits a report (blank optional fields become null) and opens it', async () => {
    mockSession(employee)
    const seen = spy()
    server.use(
      http.get(`${BASE}/projects`, () => HttpResponse.json(list([project]))),
      http.get(`${BASE}/tasks`, () => HttpResponse.json(list([task()]))),
      http.post(`${BASE}/eod`, async ({ request }) => {
        await seen.record(request)
        return HttpResponse.json(report, { status: 201 })
      }),
      http.get(`${BASE}/eod/e-1`, () => HttpResponse.json(report)),
    )
    renderApp('/eod/new')
    const user = userEvent.setup()
    expect(await screen.findByLabelText(/report date/i)).toHaveValue('2026-03-05')
    await user.selectOptions(await screen.findByLabelText('Project'), 'p-1')
    await user.type(screen.getByLabelText(/work completed/i), '  Finished the calibration.  ')
    await user.click(screen.getByRole('button', { name: 'Submit report' }))

    await waitFor(() => expect(seen.seen).toHaveLength(1))
    expect(seen.seen[0]?.body).toEqual({
      report_date: '2026-03-05', project_id: 'p-1', task_id: null,
      work_completed: 'Finished the calibration.', work_remaining: null, issues: null, notes: null,
    })
    expect(await screen.findByRole('heading', { level: 1, name: /EOD report · 05 Mar 2026/ })).toBeInTheDocument()
    expect(screen.getByText(/cannot be edited/i)).toBeInTheDocument()
  })

  it('will not submit without the work completed', async () => {
    mockSession(employee)
    let posts = 0
    server.use(http.post(`${BASE}/eod`, () => { posts += 1; return HttpResponse.json(report) }))
    renderApp('/eod/new')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Submit report' }))
    expect(await screen.findByText('Describe the work you completed.')).toBeInTheDocument()
    expect(posts).toBe(0)
  })

  it('offers the tasks planned for the chosen date', async () => {
    mockSession(employee)
    const seen = spy()
    server.use(
      http.get(`${BASE}/tasks`, async ({ request }) => {
        await seen.record(request)
        return HttpResponse.json(list([task({ title: 'Calibrate press line 3' })]))
      }),
    )
    renderApp('/eod/new')
    expect(await screen.findByRole('option', { name: 'Calibrate press line 3' })).toBeInTheDocument()
    expect(seen.seen.at(-1)?.url.searchParams.get('task_date')).toBe('2026-03-05')
  })
})
