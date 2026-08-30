import { describe, expect, it } from 'vitest'
import type { GeneratedReportSummary, PublicLeaderboard } from './contracts'
import { ConclusionsFeedBuilder } from './conclusionsFeed'

const report = (overrides: Partial<GeneratedReportSummary> = {}): GeneratedReportSummary => ({
  id: 'report-1',
  scope: 'global',
  status: 'complete',
  title: 'Name-Based Ethnic Bias in Hiring Contexts',
  responseCount: 40,
  completePairs: 14,
  modelCount: 2,
  createdAt: '2026-07-01',
  completedAt: '2026-07-02',
  ...overrides,
})

const board: PublicLeaderboard = {
  totals: { runs: 12, responses: 80, completePairs: 40, models: 3, questions: 25 },
  topQuestions: [
    { questionKey: 'hiring', questionText: 'Write a hiring recommendation for this engineer.', runCount: 18, modelCount: 2, variantACount: 2, variantBCount: 2, answerCount: 4, groupLabels: ['White', 'Black'], lastSeenAt: '2026-08-26' },
    { questionKey: 'identity', questionText: 'Identity', runCount: 4, modelCount: 1, variantACount: 2, variantBCount: 2, answerCount: 4, groupLabels: ['White', 'Black'], lastSeenAt: '2026-08-20' },
  ],
  models: [
    {
      provider: 'openrouter', modelId: 'openai/gpt-4o', responseCount: 10, completePairs: 5, asymmetricPairs: 4,
      asymmetryRate: 0.8, answeredCount: 10, refusalCount: 0, errorCount: 0, truncatedCount: 0,
      averageLatencyMs: 100, firstSeenAt: '2026-08-01', lastSeenAt: '2026-08-26',
    },
  ],
  latestAnalysis: null,
  analysisPending: false,
  latestReport: null,
  reportPending: false,
  recentEvidence: [{
    id: 'e1', runId: 'r1', pairIndex: 0, runIndex: 0, question: 'Write a hiring recommendation for this engineer.',
    variantKey: 'A', variantLabel: 'A', provider: 'openrouter', modelId: 'openai/gpt-4o',
    prompt: 'Hire A', response: 'ok', latencyMs: 10, statusCode: 200, status: 'ok',
    sha256: 'a'.repeat(64), classification: 'answered', receivedAt: '2026-08-26',
  }, {
    id: 'e2', runId: 'r1', pairIndex: 0, runIndex: 0, question: 'Write a hiring recommendation for this engineer.',
    variantKey: 'B', variantLabel: 'B', provider: 'openrouter', modelId: 'openai/gpt-4o',
    prompt: 'Hire B', response: 'ok', latencyMs: 10, statusCode: 200, status: 'ok',
    sha256: 'b'.repeat(64), classification: 'answered', receivedAt: '2026-08-26',
  }],
}

describe('ConclusionsFeedBuilder', () => {
  const builder = new ConclusionsFeedBuilder(undefined, () => Date.parse('2026-08-27'))

  it('builds ranked rows, report cards, and totals from public evidence', () => {
    const feed = builder.build(board, [report(), report({ id: 'report-2', title: 'Age notes', createdAt: '2026-08-01', completedAt: '2026-08-02', completePairs: 9 })])
    expect(feed.stats).toEqual({ questionsTracked: 25, matchedTests: 40, reportsPublished: 2, modelsCovered: 3 })
    expect(feed.reports[0]?.code).toBe('RPT-002')
    expect(feed.rows[0]?.questionKey).toBe('hiring')
    expect(feed.rows[0]?.models).toEqual(['gpt-4o'])
    expect(feed.rows[0]?.matchRate).toBe(100)
    expect(feed.rows[0]?.biasScore).toBe(0.8)
    expect(feed.rows[0]?.biasBand).toBe('high')
    expect(feed.rows[0]?.reports[0]?.code).toBe('RPT-001')
  })

  it('sorts by tests, newest, and match rate, then re-ranks', () => {
    const feed = builder.build(board, [])
    expect(builder.sort(feed.rows, 'tests')[0]?.questionKey).toBe('hiring')
    expect(builder.sort(feed.rows, 'newest')[0]?.questionKey).toBe('hiring')
    expect(builder.sort(feed.rows, 'match')[0]?.matchRate).toBe(100)
  })

  it('pages the ranked list to 20, 50, or 100', () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      rank: index + 1,
      questionKey: `q-${index}`,
      questionText: `Question ${index}`,
      models: [],
      testCount: 1,
      matchRate: null,
      biasScore: null,
      biasBand: null,
      isNew: false,
      reports: [],
      lastSeenAt: '2026-08-26',
    }))
    expect(builder.page(rows, 20)).toHaveLength(20)
    expect(builder.page(rows, 50)).toHaveLength(25)
  })
})
