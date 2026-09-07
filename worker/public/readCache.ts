import type { D1DatabaseLike } from './d1'

/**
 * Public read snapshots: compute once, store the JSON in D1 (`public_cache_meta`),
 * and serve the stored row on later requests. A stale row is served at once and
 * refreshed in the background, so a visitor never waits for a full recompute.
 * Every D1 step is best effort — a cache failure falls back to computing.
 *
 * Invalidation does not delete the row; it replaces it with an `invalidatedAt`
 * marker. A refresh that began before that moment is refused when it tries to
 * store, so a write can never be hidden by an older computation finishing late.
 */
export const PUBLIC_READ_CACHE_TTL_MS = 60_000

const SNAPSHOT_PREFIX = 'snapshot:'
/** Keys every write to evidence must clear, even when no row exists yet. */
const CORE_KEYS = ['leaderboard', 'claims', 'reports']

interface Snapshot<T> {
  value: T
  computedAt: number
}

interface StoredRow<T> extends Partial<Snapshot<T>> {
  invalidatedAt?: number
}

export interface ReadThroughOptions<T> {
  ttlMs: number | ((value: T) => number)
  /** Run background work after the response is sent (Workers `waitUntil`). */
  defer?: (work: Promise<unknown>) => void
}

const memory = new Map<string, Snapshot<unknown>>()
const invalidatedAt = new Map<string, number>()
let allInvalidatedAt = 0
const inflight = new Map<string, Promise<unknown>>()

const isFresh = <T>(entry: Snapshot<T>, ttl: ReadThroughOptions<T>['ttlMs']) =>
  Date.now() - entry.computedAt < (typeof ttl === 'function' ? ttl(entry.value) : ttl)

const invalidatedSince = (key: string, startedAt: number) =>
  (invalidatedAt.get(key) ?? 0) >= startedAt || allInvalidatedAt >= startedAt

async function loadStored<T>(db: D1DatabaseLike | undefined, key: string): Promise<Snapshot<T> | null> {
  if (!db) return null
  try {
    const row = await db.prepare('SELECT value FROM public_cache_meta WHERE key = ?').bind(SNAPSHOT_PREFIX + key).first<{ value: unknown }>()
    if (typeof row?.value !== 'string') return null
    const parsed = JSON.parse(row.value) as StoredRow<T>
    if (typeof parsed?.computedAt !== 'number' || !('value' in parsed)) return null
    return { value: parsed.value as T, computedAt: parsed.computedAt }
  } catch {
    return null
  }
}

async function store<T>(db: D1DatabaseLike | undefined, key: string, entry: Snapshot<T>, startedAt: number): Promise<void> {
  if (invalidatedSince(key, startedAt)) return
  memory.set(key, entry)
  if (!db) return
  try {
    // The row is written only when no invalidation marker newer than this
    // computation's start exists, so a late refresh cannot resurrect old data.
    await db.prepare(`INSERT INTO public_cache_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
      WHERE COALESCE(json_extract(public_cache_meta.value, '$.invalidatedAt'), 0) < ?`)
      .bind(SNAPSHOT_PREFIX + key, JSON.stringify(entry), startedAt).run()
  } catch {
    // The next read recomputes; nothing else depends on the stored copy.
  }
}

function refresh<T>(db: D1DatabaseLike | undefined, key: string, compute: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined
  if (running) return running
  const startedAt = Date.now()
  const work = (async () => {
    const value = await compute()
    if (value != null) await store(db, key, { value, computedAt: Date.now() }, startedAt)
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

/** Mark snapshots invalid so the next read recomputes. `'all'` covers every snapshot. */
export async function invalidateSnapshots(db: D1DatabaseLike | undefined, keys: string[] | 'all'): Promise<void> {
  const now = Date.now()
  if (keys === 'all') {
    allInvalidatedAt = now
    memory.clear()
  } else {
    for (const key of keys) {
      invalidatedAt.set(key, now)
      memory.delete(key)
    }
  }
  if (!db) return
  const marker = JSON.stringify({ invalidatedAt: now })
  try {
    if (keys === 'all') {
      await db.batch([
        db.prepare("UPDATE public_cache_meta SET value = ? WHERE key LIKE 'snapshot:%'").bind(marker),
        ...CORE_KEYS.map((key) => db.prepare('INSERT INTO public_cache_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING').bind(SNAPSHOT_PREFIX + key, marker)),
      ])
    } else if (keys.length > 0) {
      await db.batch(keys.map((key) => db.prepare('INSERT INTO public_cache_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(SNAPSHOT_PREFIX + key, marker)))
    }
  } catch {
    // Best effort: the in-memory marker still protects this isolate.
  }
}

/** Memory-only reset for tests and for callers without a database handle. */
export function invalidatePublicReadCache(): void {
  memory.clear()
  invalidatedAt.clear()
  allInvalidatedAt = 0
}
