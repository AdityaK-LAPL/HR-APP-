import { HBarChart } from '@/components/charts/HBarChart'
import type { StatusCount } from '@/features/team/queries'

type Table = Record<string, { label: string }>

/** Counts by status as bars, in the order the label table lists them (statuses with no rows show as zero). */
export function StatusBars({ title, rows, table, unit, emphasise, empty }: { title: string; rows: readonly StatusCount[]; table: Table; unit: string; emphasise?: string; empty: string }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  if (total === 0) return <p>{empty}</p>
  const byStatus = new Map(rows.map((row) => [row.status, row.count]))
  return (
    <HBarChart
      title={title}
      unit={unit}
      total={total}
      rows={Object.entries(table).map(([status, entry]) => ({ key: status, label: entry.label, value: byStatus.get(status) ?? 0, ...(status === emphasise ? { emphasis: true } : {}) }))}
    />
  )
}
