import { describe, expect, it } from 'vitest'
import { invalidatePublicReadCache, readCachedLeaderboard, writeCachedLeaderboard } from './readCache'

describe('public read cache', () => {
  it('stores and clears leaderboard responses', () => {
    invalidatePublicReadCache()
    expect(readCachedLeaderboard()).toBeNull()
    writeCachedLeaderboard({
      totals: { runs: 1, responses: 2, completePairs: 1, models: 1, questions: 1 },
      topQuestions: [],
      models: [],
      latestAnalysis: null,
      analysisPending: false,
      latestReport: null,
      reportPending: false,
      recentEvidence: [],
    })
    expect(readCachedLeaderboard()?.totals.runs).toBe(1)
    invalidatePublicReadCache()
    expect(readCachedLeaderboard()).toBeNull()
  })
})
