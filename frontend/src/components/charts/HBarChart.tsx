import { Link } from 'react-router-dom'

export interface BarRow {
  key: string
  label: string
  value: number
  /** Where the label links to, if anywhere. */
  href?: string
  /** One bar the story is about (drawn in the accent hue; the rest stay in the base hue). */
  emphasis?: boolean
}

/**
 * Horizontal bars for comparing magnitudes (counts by status, days present per person ...).
 *
 * Form: one measure, one baseline, no second axis - so one hue for every bar (the label, not the
 * colour, says which bar is which) and a single accent for the row the reader should look at.
 * Marks are thin (20px) with a rounded data end and a square baseline end; values sit at the bar
 * tip as text, never inside it; a "View as table" disclosure carries the exact numbers for anyone
 * who cannot or will not read bars. Colours are the data-viz palette's slot 1 / slot 2 stepped for
 * this app's dark card surface (validated: lightness band, chroma, 3:1 contrast, CVD separation).
 */
export function HBarChart({
  title,
  rows,
  unit,
  total,
}: {
  title: string
  rows: readonly BarRow[]
  unit: string
  /** When given, each value also shows its share of this total. */
  total?: number
}) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  const label = (row: BarRow) => `${row.label}: ${row.value} ${unit}${total ? ` (${Math.round((row.value / total) * 100)}%)` : ''}`
  return (
    <figure className="hbar" aria-label={title}>
      <ul className="hbar-rows">
        {rows.map((row) => (
          <li key={row.key} className="hbar-row" title={label(row)}>
            <span className="hbar-label">{row.href ? <Link className="inline-link" to={row.href}>{row.label}</Link> : row.label}</span>
            <span className="hbar-track" aria-hidden="true">
              {row.value > 0 && <span className={`hbar-bar${row.emphasis ? ' emphasis' : ''}`} style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />}
            </span>
            <span className="hbar-value">
              {row.value}
              {total ? <span className="hbar-share"> {Math.round((row.value / total) * 100)}%</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <details className="hbar-table">
        <summary>View as table</summary>
        <table className="table">
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">{unit.charAt(0).toUpperCase() + unit.slice(1)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
