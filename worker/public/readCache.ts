import type { D1DatabaseLike } from './d1'

/**
 * Public read snapshots: compute once, store the JSON in D1 (`public_cache_meta`),
 * and serve the stored row on later requests. A stale row is served at once and
 * refreshed in the background, so a visitor never waits for a full recompute.
 * Every D1 step is best effort — a cache failure falls back to computing.
 */
export const PUBLIC_READ_CACHE_TTL_MS = 60_000

const SNAPSHOT_PREFIX = 'snapshot:'

interface Snapshot<T> {
  value: T
  computedAt: number
}

export interface ReadThroughOptions<T> {
  ttlMs: number | ((value: T) => number)
  /** Run background work after the response is sent (Workers `waitUntil`). */
  defer?: (work: Promise<unknown>) => void
}

const memory = new Map<string, Snapshot<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

const isFresh = <T>(entry: Snapshot<T>, ttl: ReadThroughOptions<T>['ttlMs']) =>
  Date.now() - entry.computedAt < (typeof ttl === 'function' ? ttl(entry.value) : ttl)

async function loadStored<T>(db: D1DatabaseLike | undefined, key: string): Promise<Snapshot<T> | null> {
  if (!db) return null
  try {
    const row = await db.prepare('SELECT value FROM public_cache_meta WHERE key = ?').bind(SNAPSHOT_PREFIX + key).first<{ value: unknown }>()
    if (typeof row?.value !== 'string') return null
    const parsed = JSON.parse(row.value) as Partial<Snapshot<T>>
    if (typeof parsed?.computedAt !== 'number' || !('value' in parsed)) return null
    return { value: parsed.value as T, computedAt: parsed.computedAt }
  } catch {
    return null
  }
}

async function store<T>(db: D1DatabaseLike | undefined, key: string, entry: Snapshot<T>): Promise<void> {
  memory.set(key, entry)
  if (!db) return
  try {
    await db.prepare('INSERT INTO public_cache_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind(SNAPSHOT_PREFIX + key, JSON.stringify(entry)).run()
  } catch {
    // The next read recomputes; nothing else depends on the stored copy.
  }
}

function refresh<T>(db: D1DatabaseLike | undefined, key: string, compute: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined
  if (running) return running
  const work = (async () => {
    const value = await compute()
    if (value != null) await store(db, key, { value, computedAt: Date.now() })
    return value
  })().finally(() => inflight.delete(key))
  inflight.set(key, work)
  return work
}

/**
 * Return the snapshot for `key`, computing it when there is none. A fresh copy
 * (in memory or in D1) is returned as is. A stale copy is returned at once while
 * `defer` recomputes it; without `defer` the caller waits for the recompute.
 */
export async function readThrough<T>(
  db: D1DatabaseLike | undefined,
  key: string,
  compute: () => Promise<T>,
  options: ReadThroughOptions<T>,
): Promise<T> {
  let entry = memory.get(key) as Snapshot<T> | undefined
  if (entry && isFresh(entry, options.ttlMs)) return entry.value
  const stored = await loadStored<T>(db, key)
  if (stored && (!entry || stored.computedAt > entry.computedAt)) {
    memory.set(key, stored)
    entry = stored
  }
  if (entry && isFresh(entry, options.ttlMs)) return entry.value
  if (entry && options.defer) {
    options.defer(refresh(db, key, compute).catch(() => undefined))
    return entry.value
  }
  return refresh(db, key, compute)
}

/** Drop stored snapshots so the next read recomputes. `'all'` clears every snapshot. */
export async function invalidateSnapshots(db: D1DatabaseLike | undefined, keys: string[] | 'all'): Promise<void> {
  if (keys === 'all') memory.clear()
  else for (const key of keys) memory.delete(key)
  if (!db) return
  try {
    if (keys === 'all') {
      await db.prepare("DELETE FROM public_cache_meta WHERE key LIKE 'snapshot:%'").run()
    } else if (keys.length > 0) {
      await db.batch(keys.map((key) => db.prepare('DELETE FROM public_cache_meta WHERE key = ?').bind(SNAPSHOT_PREFIX + key)))
    }
  } catch {
    // Best effort: a missed delete only means one more stale-then-refresh read.
  }
}

/** Memory-only reset for tests and for callers without a database handle. */
export function invalidatePublicReadCache(): void {
  memory.clear()
}
