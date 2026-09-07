import { describe, expect, it, vi } from 'vitest'
import type { D1DatabaseLike, D1Statement } from './d1'
import { invalidatePublicReadCache, invalidateSnapshots, readThrough } from './readCache'

function fakeDb(rows = new Map<string, string>()): D1DatabaseLike & { rows: Map<string, string> } {
  const statement = (sql: string, values: unknown[] = []): D1Statement => ({
    bind: (...bound: unknown[]) => statement(sql, bound),
    first: async <T>() => {
      if (!sql.startsWith('SELECT')) return null
      const value = rows.get(String(values[0]))
      return (value == null ? null : { value }) as T | null
    },
    all: async () => ({ results: [] }),
    run: async () => {
      if (sql.startsWith('INSERT')) rows.set(String(values[0]), String(values[1]))
      if (sql.startsWith('DELETE FROM public_cache_meta WHERE key = ?')) rows.delete(String(values[0]))
      if (sql.startsWith('DELETE FROM public_cache_meta WHERE key LIKE')) {
        for (const key of [...rows.keys()]) if (key.startsWith('snapshot:')) rows.delete(key)
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

  it('does not store a null result and survives a database that fails', async () => {
    invalidatePublicReadCache()
    const db = fakeDb()
    expect(await readThrough(db, 'question:x', async () => null, { ttlMs: 60_000 })).toBeNull()
    expect(db.rows.size).toBe(0)
    const broken: D1DatabaseLike = { prepare: () => { throw new Error('D1 down') }, batch: async () => { throw new Error('D1 down') } }
    expect(await readThrough(broken, 'leaderboard', async () => 'computed', { ttlMs: 60_000 })).toBe('computed')
    await invalidateSnapshots(broken, 'all')
  })

  it('clears chosen keys or every snapshot from memory and D1', async () => {
    invalidatePublicReadCache()
    const db = fakeDb()
    await readThrough(db, 'a', async () => 1, { ttlMs: 60_000 })
    await readThrough(db, 'b', async () => 2, { ttlMs: 60_000 })
    await invalidateSnapshots(db, ['a'])
    expect(db.rows.has('snapshot:a')).toBe(false)
    expect(db.rows.has('snapshot:b')).toBe(true)
    await invalidateSnapshots(db, 'all')
    expect(db.rows.size).toBe(0)
  })
})
