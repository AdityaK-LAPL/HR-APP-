import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMediaQuery } from '@/lib/useMediaQuery'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** The row's headline: becomes the card title on phones and the link text on desktop. */
  primary?: boolean
  /** Left out of the phone card (low-value detail). */
  hideOnPhone?: boolean
}

/**
 * Rows as a table on tablets/desktops and as cards on phones (no sideways-scrolling tables).
 * `rowHref` makes the primary cell a real link, so rows are keyboard- and screen-reader-friendly.
 */
export function RecordList<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  caption,
}: {
  rows: readonly T[]
  columns: readonly Column<T>[]
  rowKey: (row: T) => string
  rowHref?: (row: T) => string
  caption: string
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  const primary = columns.find((column) => column.primary) ?? columns[0]

  if (wide) {
    return (
      <div className="table-wrap">
        <table className="table">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {rowHref && column === primary ? (
                      <Link to={rowHref(row)}>{column.cell(row)}</Link>
                    ) : (
                      column.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <ul className="card-list" aria-label={caption}>
      {rows.map((row) => (
        <li key={rowKey(row)} className="record-card glass-card">
          <div className="record-card-title">
            {rowHref && primary ? <Link to={rowHref(row)}>{primary.cell(row)}</Link> : primary?.cell(row)}
          </div>
          <dl className="record-card-facts">
            {columns
              .filter((column) => column !== primary && !column.hideOnPhone)
              .map((column) => (
                <div key={column.key}>
                  <dt>{column.header}</dt>
                  <dd>{column.cell(row)}</dd>
                </div>
              ))}
          </dl>
        </li>
      ))}
    </ul>
  )
}
