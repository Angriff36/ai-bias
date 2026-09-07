import type { D1DatabaseLike } from './d1'

/**
 * Public read snapshots: compute once, store the JSON in D1 (`public_cache_meta`),
 * and serve the stored row on later requests — one small row read instead of a
 * full recompute. A stale row is served at once and refreshed in the background,
 * so a visitor never waits for a recompute. There is deliberately no per-isolate
 * memory copy: D1 is the single source of truth, so a write in any isolate or
 * data centre is seen by the very next read everywhere.
 * Every D1 step is best effort — a cache failure falls back to computing.
 *
 * Ordering uses generation counters kept in D1, never wall clocks. A row carries
 * the generation it was computed under; invalidation bumps the row to a marker
 * with the next generation. A refresh stores only while the generation it started
 * under is still current, so a late computation cannot resurrect pre-write data.
 */
export const PUBLIC_READ_CACHE_TTL_MS = 60_000

const SNAPSHOT_PREFIX = 'snapshot:'
/** Global generation: bumped by "invalidate everything"; guards keys that have no row yet. */
const ALL_KEY = 'snapshot:__all__'

interface Snapshot<T> {
  value: T
  computedAt: number
}

interface StoredRow<T> extends Partial<Snapshot<T>> {
  gen?: number
  invalidatedGen?: number
}

interface Loaded<T> {
  snapshot: Snapshot<T> | null
  /** Generation of the key's row (0 when absent) and of the global counter, as seen at read time. */
  gen: number
  allGen: number
}

export interface ReadThroughOptions<T> {
  ttlMs: number | ((value: T) => number)
  /** Run background work after the response is sent (Workers `waitUntil`). */
  defer?: (work: Promise<unknown>) => void
}

const inflight = new Map<string, Promise<unknown>>()

const CURRENT_GEN = "COALESCE(json_extract(value, '$.gen'), json_extract(value, '$.invalidatedGen'), 0)"

const isFresh = <T>(entry: Snapshot<T>, ttl: ReadThroughOptions<T>['ttlMs']) =>
  Date.now() - entry.computedAt < (typeof ttl === 'function' ? ttl(entry.value) : ttl)

function parseRow<T>(value: unknown): StoredRow<T> | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as StoredRow<T>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

async function load<T>(db: D1DatabaseLike | undefined, key: string): Promise<Loaded<T>> {
  const empty: Loaded<T> = { snapshot: null, gen: 0, allGen: 0 }
  if (!db) return empty
  try {
    const [row, all] = await db.batch<{ value: unknown }>([
      db.prepare('SELECT value FROM public_cache_meta WHERE key = ?').bind(SNAPSHOT_PREFIX + key),
      db.prepare('SELECT value FROM public_cache_meta WHERE key = ?').bind(ALL_KEY),
    ])
    const stored = parseRow<T>(row.results?.[0]?.value)
    const global = parseRow<never>(all.results?.[0]?.value)
    const gen = stored?.gen ?? stored?.invalidatedGen ?? 0
    const snapshot = stored && typeof stored.computedAt === 'number' && 'value' in stored
      ? { value: stored.value as T, computedAt: stored.computedAt }
      : null
    return { snapshot, gen, allGen: global?.gen ?? 0 }
  } catch {
    return empty
  }
}

async function store<T>(db: D1DatabaseLike | undefined, key: string, entry: Snapshot<T>, startedGen: number, startedAllGen: number): Promise<void> {
  if (!db) return
  try {
    // A new row is written only while the global generation is unchanged; an
    // existing row only while its own generation is unchanged. Either bump
    // means a write happened after this computation began, so it is dropped.
    await db.prepare(`INSERT INTO public_cache_meta (key, value)
      SELECT ?, ? WHERE COALESCE((SELECT json_extract(value, '$.gen') FROM public_cache_meta WHERE key = ?), 0) = ?
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
      WHERE COALESCE(json_extract(public_cache_meta.value, '$.gen'), json_extract(public_cache_meta.value, '$.invalidatedGen'), 0) = ?`)
      .bind(SNAPSHOT_PREFIX + key, JSON.stringify({ ...entry, gen: startedGen }), ALL_KEY, startedAllGen, startedGen).run()
  } catch {
    // The next read recomputes; nothing else depends on the stored copy.
  }
}

function refresh<T>(db: D1DatabaseLike | undefined, key: string, compute: () => Promise<T>, loaded: Loaded<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined
  if (running) return running
  const work = (async () => {
    const value = await compute()
    if (value != null) await store(db, key, { value, computedAt: Date.now() }, loaded.gen, loaded.allGen)
    return value
  })().finally(() => inflight.delete(key))
  inflight.set(key, work)
  return work
}

/**
 * Return the snapshot for `key`, computing it when there is none. A fresh stored
 * copy is returned as is. A stale copy is returned at once while `defer`
 * recomputes it; without `defer` the caller waits for the recompute.
 */
export async function readThrough<T>(
  db: D1DatabaseLike | undefined,
  key: string,
  compute: () => Promise<T>,
  options: ReadThroughOptions<T>,
): Promise<T> {
  const loaded = await load<T>(db, key)
  if (loaded.snapshot && isFresh(loaded.snapshot, options.ttlMs)) return loaded.snapshot.value
  if (loaded.snapshot && options.defer) {
    options.defer(refresh(db, key, compute, loaded).catch(() => undefined))
    return loaded.snapshot.value
  }
  return refresh(db, key, compute, loaded)
}

/** Bump snapshots to a new generation so the next read recomputes. `'all'` covers every snapshot. */
export async function invalidateSnapshots(db: D1DatabaseLike | undefined, keys: string[] | 'all'): Promise<void> {
  if (!db) return
  try {
    if (keys === 'all') {
      await db.batch([
        db.prepare(`UPDATE public_cache_meta SET value = json_object('invalidatedGen', ${CURRENT_GEN} + 1) WHERE key LIKE 'snapshot:%' AND key <> ?`).bind(ALL_KEY),
        db.prepare(`INSERT INTO public_cache_meta (key, value) VALUES (?, json_object('gen', 1))
          ON CONFLICT(key) DO UPDATE SET value = json_object('gen', COALESCE(json_extract(public_cache_meta.value, '$.gen'), 0) + 1)`).bind(ALL_KEY),
      ])
    } else if (keys.length > 0) {
      await db.batch(keys.map((key) => db.prepare(`INSERT INTO public_cache_meta (key, value) VALUES (?, json_object('invalidatedGen', 1))
        ON CONFLICT(key) DO UPDATE SET value = json_object('invalidatedGen', COALESCE(json_extract(public_cache_meta.value, '$.gen'), json_extract(public_cache_meta.value, '$.invalidatedGen'), 0) + 1)`)
        .bind(SNAPSHOT_PREFIX + key)))
    }
  } catch {
    // Best effort: without the marker the row simply ages out at its TTL.
  }
}

/** Kept for tests that reset between cases; snapshots live in D1 only, so there is nothing local to clear. */
export function invalidatePublicReadCache(): void {
  inflight.clear()
}
