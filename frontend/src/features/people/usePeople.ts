import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '@/api/client'
import type { UserDirectoryEntry } from '@/api/types'

const MAX_IDS_PER_REQUEST = 100

/** Resolve user ids to display names with the batched directory endpoint (works for every role). */
export async function fetchPeople(
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<UserDirectoryEntry[]> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
    chunks.push(ids.slice(i, i + MAX_IDS_PER_REQUEST))
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      api.get<UserDirectoryEntry[]>('/users/directory', { query: { ids: chunk }, signal }),
    ),
  )
  return results.flat()
}

export function usePeople(ids: readonly (string | null | undefined)[]) {
  // The joined key is the identity: callers pass a fresh array every render.
  const key = [...new Set(ids.filter((id): id is string => Boolean(id)))].sort().join(',')
  const unique = useMemo(() => (key ? key.split(',') : []), [key])
  const query = useQuery({
    queryKey: ['people', key],
    queryFn: ({ signal }) => fetchPeople(unique, signal),
    enabled: unique.length > 0,
    staleTime: 10 * 60_000,
  })
  const byId = useMemo(
    () => new Map((query.data ?? []).map((person) => [person.id, person])),
    [query.data],
  )
  return {
    byId,
    isLoading: query.isLoading,
    /** Display name, or `fallback` while loading / when the id is unknown. */
    nameOf: (id: string | null | undefined, fallback = 'Unknown user') =>
      (id && byId.get(id)?.name) || fallback,
  }
}
