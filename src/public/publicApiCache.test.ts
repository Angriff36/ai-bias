import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidatePublicCache, readPublicCache, writePublicCache } from './publicApiCache'

describe('publicApiCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    invalidatePublicCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('serves fresh entries within the ttl and stale entries until stale window expires', () => {
    writePublicCache('leaderboard', { ok: true })
    expect(readPublicCache('leaderboard', 60_000, 300_000)?.status).toBe('fresh')

    vi.advanceTimersByTime(61_000)
    const entry = readPublicCache<{ ok: boolean }>('leaderboard', 60_000, 300_000)
    expect(entry?.status).toBe('stale')
    expect(entry?.data.ok).toBe(true)
  })

  it('invalidates by prefix', () => {
    writePublicCache('question:one', { id: 1 })
    writePublicCache('question:two', { id: 2 })
    writePublicCache('leaderboard', { id: 3 })
    invalidatePublicCache('question:')
    expect(readPublicCache('question:one')).toBeNull()
    expect(readPublicCache('leaderboard')).not.toBeNull()
  })
})
