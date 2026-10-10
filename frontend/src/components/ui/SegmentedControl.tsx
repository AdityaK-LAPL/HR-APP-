/**
 * A small set of mutually exclusive views ("Team requests" / "My leave"). Buttons with
 * `aria-pressed`, so it is keyboard- and screen-reader-friendly without tab semantics to maintain.
 */
export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: V
  options: readonly { value: V; label: string }[]
  onChange: (value: V) => void
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented-item${option.value === value ? ' active' : ''}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
