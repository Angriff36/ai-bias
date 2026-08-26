import { describe, expect, it } from 'vitest'
import type { PublicLeaderboard } from '../../src/public/contracts'
import { buildAnalysisPrompt, thresholdsCrossed } from './analysis'

describe('leaderboard analysis thresholds', () => {
  it('claims the initial and recurring thresholds exactly once', () => {
    expect(thresholdsCrossed(24, 25)).toEqual([25])
    expect(thresholdsCrossed(99, 100)).toEqual([100])
    expect(thresholdsCrossed(349, 351)).toEqual([350])
    expect(thresholdsCrossed(350, 599)).toEqual([])
    expect(thresholdsCrossed(599, 601)).toEqual([600])
  })

  it('sends aggregate model statistics to analysis without raw evidence', () => {
    const leaderboard: PublicLeaderboard = {
      totals: { runs: 3, responses: 50, completePairs: 25, models: 1 },
      models: [{ provider: 'openrouter', modelId: 'model/a', responseCount: 50, completePairs: 25, asymmetricPairs: 4, asymmetryRate: 0.16, answeredCount: 44, refusalCount: 6, errorCount: 0, truncatedCount: 0, averageLatencyMs: 120, firstSeenAt: 'first', lastSeenAt: 'last' }],
      latestAnalysis: null,
      analysisPending: false,
      recentEvidence: [{ id: 'private', runId: 'run', pairIndex: 0, runIndex: 0, variantKey: 'A', variantLabel: 'A', provider: 'openrouter', modelId: 'model/a', prompt: 'RAW PROMPT', response: 'RAW RESPONSE', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: 'now' }],
    }

    const prompt = buildAnalysisPrompt(leaderboard, 25)
    expect(prompt).toContain('model/a')
    expect(prompt).toContain('25 complete matched pairs')
    expect(prompt).not.toContain('RAW PROMPT')
    expect(prompt).not.toContain('RAW RESPONSE')
  })
})
