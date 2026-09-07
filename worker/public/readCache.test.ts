import { describe, expect, it, vi } from 'vitest'
import type { D1DatabaseLike, D1Result, D1Statement } from './d1'
import { invalidatePublicReadCache, invalidateSnapshots, readThrough } from './readCache'

type Row = { gen?: number; invalidatedGen?: number; value?: unknown; computedAt?: number }

/** Just enough SQLite to mirror the statements readCache issues against public_cache_meta. */
function fakeDb(rows = new Map<string, string>()): D1DatabaseLike & { rows: Map<string, string>; row(key: string): Row } {
  const row = (key: string): Row => JSON.parse(rows.get(key) ?? '{}') as Row
  const currentGen = (key: string) => row(key).gen ?? row(key).invalidatedGen ?? 0
  const statement = (sql: string, values: unknown[] = []): D1Statement => {
    const run = async <T>(): Promise<D1Result<T>> => {
      const key = String(values[0])
      if (sql.startsWith('SELECT')) {
        const value = rows.get(key)
        return { results: (value == null ? [] : [{ value }]) as T[] }
      }
      if (sql.startsWith('INSERT INTO public_cache_meta (key, value)\n      SELECT')) {
        // Guarded snapshot write.
        const [, json, allKey, startedAllGen, startedGen] = values as [string, string, string, number, number]
        if (!rows.has(key)) {
          if ((row(allKey).gen ?? 0) === startedAllGen) rows.set(key, json)
        } else if (currentGen(key) === startedGen) {
          rows.set(key, json)
        }
      } else if (sql.includes("json_object('gen', 1)")) {
        rows.set(key, JSON.stringify({ gen: (row(key).gen ?? 0) + 1 }))
      } else if (sql.includes("json_object('invalidatedGen', 1)")) {
        rows.set(key, JSON.stringify({ invalidatedGen: currentGen(key) + 1 }))
      } else if (sql.startsWith('UPDATE public_cache_meta SET value = json_object')) {
        for (const existing of [...rows.keys()]) {
          if (existing.startsWith('snapshot:') && existing !== key) rows.set(existing, JSON.stringify({ invalidatedGen: currentGen(existing) + 1 }))
        }
      }
      return { meta: { changes: 1 } }
    }
    return {
      bind: (...bound: unknown[]) => statement(sql, bound),
      first: async <T>() => ((await run<T>()).results?.[0] ?? null),
      all: run,
      run,
    }
  }
  return {
    rows,
    row,
    prepare: (sql: string) => statement(sql),
    batch: async <T>(statements: D1Statement[]) => Promise.all(statements.map((item) => item.run<T>())),
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

describe('public read snapshots', () => {
  it('computes once, stores the snapshot in D1, and serves it to any isolate', async () => {
    invalidatePublicReadCache()
    const db = fakeDb()
    const compute = vi.fn(async () => ({ total: 7 }))
    expect(await readThrough(db, 'leaderboard', compute, { ttlMs: 60_000 })).toEqual({ total: 7 })
    expect(db.row('snapshot:leaderboard')).toMatchObject({ value: { total: 7 }, gen: 0 })

    invalidatePublicReadCache()
    expect(await readThrough(db, 'leaderboard', compute, { ttlMs: 60_000 })).toEqual({ total: 7 })
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('serves a stale snapshot at once and refreshes it in the background', async () => {
    invalidatePublicReadCache()
    const db = fakeDb(new Map([['snapshot:claims', JSON.stringify({ value: ['old'], computedAt: Date.now() - 10 * 60_000, gen: 0 })]]))
    const deferred: Promise<unknown>[] = []
    const compute = vi.fn(async () => ['new'])
    expect(await readThrough(db, 'claims', compute, { ttlMs: 60_000, defer: (work) => { deferred.push(work) } })).toEqual(['old'])
    await Promise.all(deferred)
    expect(compute).toHaveBeenCalledTimes(1)
    expect(await readThrough(db, 'claims', compute, { ttlMs: 60_000 })).toEqual(['new'])
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('waits for the recompute when nothing can run in the background', async () => {
    invalidatePublicReadCache()
    const db = fakeDb(new Map([['snapshot:reports', JSON.stringify({ value: 1, computedAt: Date.now() - 10 * 60_000, gen: 0 })]]))
    expect(await readThrough(db, 'reports', async () => 2, { ttlMs: 60_000 })).toBe(2)
  })

  it('sees a write from any other isolate on the very next read', async () => {
    invalidatePublicReadCache()
    const db = fakeDb()
    expect(await readThrough(db, 'question:q', async () => 'old answers', { ttlMs: 10 * 60_000 })).toBe('old answers')
    await invalidateSnapshots(db, 'all')
    const compute = vi.fn(async () => 'new answers')
    expect(await readThrough(db, 'question:q', compute, { ttlMs: 10 * 60_000 })).toBe('new answers')
    expect(compute).toHaveBeenCalledTimes(1)
    expect(db.row('snapshot:question:q')).toMatchObject({ value: 'new answers', gen: 1 })
  })

  it('refuses to store a computation that began before a write invalidated the key', async () => {
    invalidatePublicReadCache()
    const db = fakeDb()
    let release: (value: string) => void = () => undefined
    const slow = readThrough(db, 'leaderboard', () => new Promise<string>((resolve) => { release = resolve }), { ttlMs: 60_000 })
    await tick()
    await invalidateSnapshots(db, ['leaderboard'])
    release('pre-write data')
    expect(await slow).toBe('pre-write data')
    expect(db.row('snapshot:leaderboard')).toEqual({ invalidatedGen: 1 })

    const compute = vi.fn(async () => 'post-write data')
    expect(await readThrough(db, 'leaderboard', compute, { ttlMs: 60_000 })).toBe('post-write data')
    expect(compute).toHaveBeenCalledTimes(1)
    expect(db.row('snapshot:leaderboard')).toMatchObject({ value: 'post-write data', gen: 1 })
  })

  it('does not depend on clocks: a computation stamped by a fast clock still loses to a later invalidation', async () => {
    invalidatePublicReadCache()
    const db = fakeDb()
    const realNow = Date.now
    // The computing isolate's clock runs one minute ahead of the invalidating one.
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 60_000)
    let release: (value: string) => void = () => undefined
    const slow = readThrough(db, 'claims', () => new Promise<string>((resolve) => { release = resolve }), { ttlMs: 60_000 })
    vi.restoreAllMocks()
    await tick()
    await invalidateSnapshots(db, 'all')
    release('pre-write claims')
    expect(await slow).toBe('pre-write claims')
    expect(db.rows.has('snapshot:claims')).toBe(false)
  })

  it('invalidating everything marks every stored snapshot and blocks late first-time writes', async () => {
    invalidatePublicReadCache()
    const db = fakeDb()
    await readThrough(db, 'question:a', async () => 1, { ttlMs: 60_000 })
    let release: (value: string) => void = () => undefined
    const late = readThrough(db, 'question:b', () => new Promise<string>((resolve) => { release = resolve }), { ttlMs: 60_000 })
    await tick()
    await invalidateSnapshots(db, 'all')
    expect(db.row('snapshot:question:a')).toEqual({ invalidatedGen: 1 })
    release('pre-publication answers')
    expect(await late).toBe('pre-publication answers')
    expect(db.rows.has('snapshot:question:b')).toBe(false)
    expect(await readThrough(db, 'question:a', async () => 2, { ttlMs: 60_000 })).toBe(2)
  })

  it('does not store a null result and survives a database that fails', async () => {
    invalidatePublicReadCache()
    const db = fakeDb()
    expect(await readThrough(db, 'question:x', async () => null, { ttlMs: 60_000 })).toBeNull()
    expect(db.rows.size).toBe(0)
    const broken: D1DatabaseLike = { prepare: () => { throw new Error('D1 down') }, batch: async () => { throw new Error('D1 down') } }
    expect(await readThrough(broken, 'leaderboard', async () => 'computed', { ttlMs: 60_000 })).toBe('computed')
    await invalidateSnapshots(broken, 'all')
  })
})
