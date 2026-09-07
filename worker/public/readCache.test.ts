import { describe, expect, it, vi } from 'vitest'
import type { D1DatabaseLike, D1Statement } from './d1'
import { invalidatePublicReadCache, invalidateSnapshots, readThrough } from './readCache'

/** Just enough SQLite to mirror the statements readCache issues against public_cache_meta. */
function fakeDb(rows = new Map<string, string>()): D1DatabaseLike & { rows: Map<string, string> } {
  const invalidatedAtOf = (json: string | undefined) => (json ? Number((JSON.parse(json) as { invalidatedAt?: number }).invalidatedAt ?? 0) : 0)
  const statement = (sql: string, values: unknown[] = []): D1Statement => ({
    bind: (...bound: unknown[]) => statement(sql, bound),
    first: async <T>() => {
      if (!sql.startsWith('SELECT')) return null
      const value = rows.get(String(values[0]))
      return (value == null ? null : { value }) as T | null
    },
    all: async () => ({ results: [] }),
    run: async () => {
      const key = String(values[0])
      if (sql.startsWith('INSERT') && sql.includes('DO NOTHING')) {
        if (!rows.has(key)) rows.set(key, String(values[1]))
      } else if (sql.startsWith('INSERT') && sql.includes('WHERE COALESCE')) {
        if (!rows.has(key) || invalidatedAtOf(rows.get(key)) < Number(values[2])) rows.set(key, String(values[1]))
      } else if (sql.startsWith('INSERT')) {
        rows.set(key, String(values[1]))
      } else if (sql.startsWith('UPDATE public_cache_meta SET value = ? WHERE key LIKE')) {
        for (const existing of [...rows.keys()]) if (existing.startsWith('snapshot:')) rows.set(existing, String(values[0]))
      }
      return { meta: { changes: 1 } }
    },
  })
  return {
    rows,
    prepare: (sql: string) => statement(sql),
    batch: async <T>(statements: D1Statement[]) => Promise.all(statements.map((item) => item.run<T>())),
  }
}

describe('public read snapshots', () => {
  it('computes once, stores the snapshot in D1, and serves it to a fresh isolate', async () => {
    invalidatePublicReadCache()
    const db = fakeDb()
    const compute = vi.fn(async () => ({ total: 7 }))
    expect(await readThrough(db, 'leaderboard', compute, { ttlMs: 60_000 })).toEqual({ total: 7 })
    expect(db.rows.has('snapshot:leaderboard')).toBe(true)

    invalidatePublicReadCache()
    expect(await readThrough(db, 'leaderboard', compute, { ttlMs: 60_000 })).toEqual({ total: 7 })
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('serves a stale snapshot at once and refreshes it in the background', async () => {
    invalidatePublicReadCache()
    const db = fakeDb(new Map([['snapshot:claims', JSON.stringify({ value: ['old'], computedAt: Date.now() - 10 * 60_000 })]]))
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
    const db = fakeDb(new Map([['snapshot:reports', JSON.stringify({ value: 1, computedAt: Date.now() - 10 * 60_000 })]]))
    expect(await readThrough(db, 'reports', async () => 2, { ttlMs: 60_000 })).toBe(2)
  })

  it('refuses to store a computation that began before a write invalidated the key', async () => {
    invalidatePublicReadCache()
    const db = fakeDb()
    let release: (value: string) => void = () => undefined
    const slow = readThrough(db, 'leaderboard', () => new Promise<string>((resolve) => { release = resolve }), { ttlMs: 60_000 })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await invalidateSnapshots(db, ['leaderboard'])
    release('pre-write data')
    expect(await slow).toBe('pre-write data')

    // Neither this isolate's memory nor D1 kept the outdated result.
    const compute = vi.fn(async () => 'post-write data')
    expect(await readThrough(db, 'leaderboard', compute, { ttlMs: 60_000 })).toBe('post-write data')
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('protects other isolates too: the D1 marker outranks an older computation', async () => {
    invalidatePublicReadCache()
    const db = fakeDb()
    await readThrough(db, 'claims', async () => 'first', { ttlMs: 60_000 })
    // Another isolate publishes evidence a moment later.
    await new Promise((resolve) => setTimeout(resolve, 5))
    invalidatePublicReadCache()
    await invalidateSnapshots(db, 'all')
    invalidatePublicReadCache()
    // Our isolate still holds nothing in memory and reads D1: the marker means "recompute".
    const compute = vi.fn(async () => 'second')
    expect(await readThrough(db, 'claims', compute, { ttlMs: 60_000 })).toBe('second')
    expect(compute).toHaveBeenCalledTimes(1)
    expect(JSON.parse(db.rows.get('snapshot:claims') ?? '{}')).toMatchObject({ value: 'second' })
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

  it('invalidating everything marks every stored snapshot and the core keys', async () => {
    invalidatePublicReadCache()
    const db = fakeDb()
    await readThrough(db, 'question:a', async () => 1, { ttlMs: 60_000 })
    await invalidateSnapshots(db, 'all')
    for (const key of ['snapshot:question:a', 'snapshot:leaderboard', 'snapshot:claims', 'snapshot:reports']) {
      expect(JSON.parse(db.rows.get(key) ?? '{}')).toHaveProperty('invalidatedAt')
    }
    expect(await readThrough(db, 'question:a', async () => 2, { ttlMs: 60_000 })).toBe(2)
  })
})
