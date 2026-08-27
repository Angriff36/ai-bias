const DEFAULT_TTL_MS = 60_000
const DEFAULT_STALE_MS = 300_000

interface CacheEntry {
  data: unknown
  fetchedAt: number
}

const store = new Map<string, CacheEntry>()

export function readPublicCache<T>(
  key: string,
  ttlMs = DEFAULT_TTL_MS,
  staleMs = DEFAULT_STALE_MS,
): { data: T; status: 'fresh' | 'stale' } | null {
  const entry = store.get(key)
  if (!entry) return null
  const age = Date.now() - entry.fetchedAt
  if (age > staleMs) {
    store.delete(key)
    return null
  }
  return { data: entry.data as T, status: age <= ttlMs ? 'fresh' : 'stale' }
}

export function writePublicCache<T>(key: string, data: T): void {
  store.set(key, { data, fetchedAt: Date.now() })
}

export function invalidatePublicCache(prefix?: string): void {
  if (!prefix) {
    store.clear()
    return
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}
