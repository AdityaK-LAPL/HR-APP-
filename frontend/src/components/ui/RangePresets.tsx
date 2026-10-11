import { addDays, monthStart } from '@/lib/calendar'
import { Button } from './Button'

/** One-tap periods for a date-range filter (company dates). `from`/`to` empty means "no range chosen". */
export function RangePresets({ today, from, to, onChange }: { today: string; from: string; to: string; onChange: (from: string, to: string) => void }) {
  const presets = [
    { label: 'Today', from: today },
    { label: 'Last 7 days', from: addDays(today, -6) },
    { label: 'Last 30 days', from: addDays(today, -29) },
    { label: 'This month', from: monthStart(today.slice(0, 7)) },
  ]
  return (
    <span className="meta-line" role="group" aria-label="Quick periods">
      {presets.map((preset) => (
        <Button key={preset.label} size="sm" variant={from === preset.from && to === today ? 'primary' : 'outline'} aria-pressed={from === preset.from && to === today} onClick={() => onChange(preset.from, today)}>
          {preset.label}
        </Button>
      ))}
    </span>
  )
}
