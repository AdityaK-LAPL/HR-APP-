import { labelOf, toneOf, type Tone } from '@/lib/labels'

type Table = Parameters<typeof toneOf>[0]

/** A coloured pill. The text always carries the meaning; colour is reinforcement only. */
export function StatusBadge({ table, value }: { table: Table; value: string }) {
  const tone: Tone = toneOf(table, value)
  return <span className={`badge badge-${tone}`}>{labelOf(table, value)}</span>
}
