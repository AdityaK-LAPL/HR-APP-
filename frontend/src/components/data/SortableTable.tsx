import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

export interface SortColumn<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** What to compare when sorting this column; leave out to make it unsortable. */
  sortValue?: (row: T) => string | number
  numeric?: boolean
}

/**
 * A table the reader can sort. Used only where the whole data set is on the page (the API's report
 * endpoints are unpaged); paged lists keep the API's own order, because sorting one page of many
 * would mislead.
 */
export function SortableTable<T>({
  rows,
  columns,
  rowKey,
  caption,
  initial,
}: {
  rows: readonly T[]
  columns: readonly SortColumn<T>[]
  rowKey: (row: T) => string
  caption: string
  initial?: { key: string; direction: 'asc' | 'desc' }
}) {
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(initial ?? null)
  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sort?.key)
    if (!sort || !column?.sortValue) return rows
    const value = column.sortValue
    const factor = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = value(a)
      const y = value(b)
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * factor
    })
  }, [rows, columns, sort])

  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key
              return (
                <th key={column.key} scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : column.sortValue ? 'none' : undefined}>
                  {column.sortValue ? (
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => setSort(active ? { key: column.key, direction: sort.direction === 'asc' ? 'desc' : 'asc' } : { key: column.key, direction: column.numeric ? 'desc' : 'asc' })}
                    >
                      {column.header}
                      {active ? sort.direction === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" /> : <ArrowUpDown size={14} aria-hidden="true" />}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key}>{column.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
