import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SortableTable } from '@/components/data/SortableTable'
import { HBarChart } from './HBarChart'

describe('HBarChart', () => {
  const rows = [
    { key: 'a', label: 'Completed', value: 6 },
    { key: 'b', label: 'Blocked', value: 2, emphasis: true },
    { key: 'c', label: 'Not started', value: 0 },
  ]

  it('draws bars in proportion with the value at the tip and a share of the total', () => {
    render(<MemoryRouter><HBarChart title="Tasks by status" unit="tasks" total={8} rows={rows} /></MemoryRouter>)
    const chart = screen.getByRole('figure', { name: 'Tasks by status' })
    const items = within(chart).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Completed')
    expect(items[0]).toHaveTextContent('6 75%')
    expect(items[0]?.querySelector('.hbar-bar')).toHaveStyle({ width: '100%' })
    expect(items[1]?.querySelector('.hbar-bar')).toHaveStyle({ width: '33.33333333333333%' })
    expect(items[1]?.querySelector('.hbar-bar')).toHaveClass('emphasis')
    expect(items[2]?.querySelector('.hbar-bar')).toBeNull() // zero: no mark, still listed
    expect(items[0]).toHaveAttribute('title', 'Completed: 6 tasks (75%)')
  })

  it('carries the same numbers as a table, for anyone who cannot read bars', async () => {
    render(<MemoryRouter><HBarChart title="Tasks by status" unit="tasks" rows={rows} /></MemoryRouter>)
    await userEvent.setup().click(screen.getByText('View as table'))
    const table = screen.getByRole('table', { name: 'Tasks by status' })
    expect(within(table).getByRole('row', { name: /Blocked 2/ })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Tasks' })).toBeInTheDocument()
  })

  it('links a label when it has somewhere to go', () => {
    render(<MemoryRouter><HBarChart title="x" unit="days" rows={[{ key: 'p', label: 'Erin', value: 3, href: '/users/p' }]} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Erin' })).toHaveAttribute('href', '/users/p')
  })
})

describe('SortableTable', () => {
  const data = [
    { id: '1', name: 'Bea', days: 5 },
    { id: '2', name: 'Al', days: 9 },
    { id: '3', name: 'Cy', days: 7 },
  ]
  const columns = [
    { key: 'name', header: 'Person', sortValue: (r: (typeof data)[number]) => r.name, cell: (r: (typeof data)[number]) => r.name },
    { key: 'days', header: 'Days', numeric: true, sortValue: (r: (typeof data)[number]) => r.days, cell: (r: (typeof data)[number]) => r.days },
    { key: 'note', header: 'Note', cell: () => '—' },
  ]
  const names = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0]?.textContent)

  it('sorts a column both ways, numbers high-to-low first, and announces it', async () => {
    render(<SortableTable rows={data} columns={columns} rowKey={(r) => r.id} caption="People" />)
    const user = userEvent.setup()
    expect(names()).toEqual(['Bea', 'Al', 'Cy']) // as given until the reader chooses
    await user.click(screen.getByRole('button', { name: 'Days' }))
    expect(names()).toEqual(['Al', 'Cy', 'Bea'])
    expect(screen.getByRole('columnheader', { name: 'Days' })).toHaveAttribute('aria-sort', 'descending')
    await user.click(screen.getByRole('button', { name: 'Days' }))
    expect(names()).toEqual(['Bea', 'Cy', 'Al'])
    expect(screen.getByRole('columnheader', { name: 'Days' })).toHaveAttribute('aria-sort', 'ascending')
    await user.click(screen.getByRole('button', { name: 'Person' }))
    expect(names()).toEqual(['Al', 'Bea', 'Cy'])
  })

  it('leaves columns without a sort value as plain headings', () => {
    render(<SortableTable rows={data} columns={columns} rowKey={(r) => r.id} caption="People" />)
    expect(screen.queryByRole('button', { name: 'Note' })).not.toBeInTheDocument()
  })

  it('can start sorted', () => {
    render(<SortableTable rows={data} columns={columns} rowKey={(r) => r.id} caption="People" initial={{ key: 'days', direction: 'desc' }} />)
    expect(names()).toEqual(['Al', 'Cy', 'Bea'])
  })
})
