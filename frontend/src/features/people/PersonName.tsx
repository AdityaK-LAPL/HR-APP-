import { usePeople } from './usePeople'

/** Renders a user's name for an id (batched and cached through the directory). */
export function PersonName({ id, fallback = '—' }: { id: string | null | undefined; fallback?: string }) {
  const { nameOf } = usePeople([id])
  if (!id) return <>{fallback}</>
  return <>{nameOf(id, '…')}</>
}
