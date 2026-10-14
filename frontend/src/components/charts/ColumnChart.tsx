export interface ColumnPoint {
  key: string
  /** Short axis label under the column (a day of the month). */
  label: string
  value: number
  /** Drawn in a quieter tone (a weekly off or a holiday), so the working days stand out. */
  muted?: boolean
  /** Full wording for the hover title and the table view. */
  title: string
}

/**
 * Columns over time for ONE measure (people working each day ...). One hue, one baseline, no second
 * axis; quiet columns mark days that are not expected workdays. The exact numbers are always
 * available through "View as table".
 */
export function ColumnChart({ title, points, unit }: { title: string; points: readonly ColumnPoint[]; unit: string }) {
  const max = Math.max(1, ...points.map((point) => point.value))
  return (
    <figure className="vbar" aria-label={title}>
      <ul className="vbar-cols">
        {points.map((point) => (
          <li key={point.key} className="vbar-col" title={`${point.title}: ${point.value} ${unit}`}>
            <span className="vbar-track" aria-hidden="true">
              {point.value > 0 && <span className={`vbar-bar${point.muted ? ' muted' : ''}`} style={{ height: `${Math.max(3, (point.value / max) * 100)}%` }} />}
            </span>
            <span className="vbar-label" aria-hidden="true">
              {point.label}
            </span>
          </li>
        ))}
      </ul>
      <p className="vbar-note">Tallest column: {max} {unit}. Lighter columns are weekly offs and holidays.</p>
      <details className="hbar-table">
        <summary>View as table</summary>
        <table className="table">
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">{unit.charAt(0).toUpperCase() + unit.slice(1)}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.key}>
                <th scope="row">{point.title}</th>
                <td>{point.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
