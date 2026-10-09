import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <nav className="pagination" aria-label="Pagination">
      <Button
        variant="outline"
        size="sm"
        icon={<ChevronLeft size={16} />}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
      >
        Prev
      </Button>
      <span aria-live="polite">
        Page {page} of {pages} · {total} total
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        Next <ChevronRight size={16} aria-hidden="true" />
      </Button>
    </nav>
  )
}
