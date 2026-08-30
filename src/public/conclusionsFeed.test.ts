import { describe, expect, it } from 'vitest'
import type { GeneratedReportSummary, PublicClaim, PublicLeaderboard } from './contracts'
import { ConclusionsFeedBuilder } from './conclusionsFeed'

function report(overrides: Partial<GeneratedReportSummary> = {}): GeneratedReportSummary {
  return {
    id: 'report-1', scope: 'global', status: 'complete', title: 'Hiring audit', responseCount: 40, completePairs: 18,
    modelCount: 2, createdAt: '2026-08-20', completedAt: '2026-08-21', ...overrides,
  }
}

function claim(overrides: Partial<PublicClaim> = {}): PublicClaim {
  return {
    id: 'claim-1', text: 'Does the model hedge more when the prompt names a White person?', questionKeys: ['hiring'],
    createdAt: '2026-08-26', testCount: 18, matchRate: 100, biasScore: 0.8, models: ['gpt-4o'], lastSeenAt: '2026-08-26',
    reports: [{ id: 'report-1', title: 'Hiring audit' }], ...overrides,
  }
}

const board: PublicLeaderboard = {
  totals: { runs: 12, responses: 80, completePairs: 40, models: 3, questions: 25 },
  topQuestions: [
    { questionKey: 'hiring', questionText: 'Write a hiring recommendation for this engineer.', runCount: 18, modelCount: 2, variantACount: 2, variantBCount: 2, answerCount: 4, groupLabels: ['White', 'Black'], lastSeenAt: '2026-08-26' },
  ],
  models: [],
  latestAnalysis: null,
  analysisPending: false,
  latestReport: null,
  reportPending: false,
  recentEvidence: [],
}

describe('ConclusionsFeedBuilder', () => {
  const builder = new ConclusionsFeedBuilder(() => Date.parse('2026-08-27'))

  it('builds claim rows with computed answers, report cards, and totals', () => {
    const feed = builder.build(board, [report(), report({ id: 'report-2', title: 'Age notes', createdAt: '2026-08-01', completedAt: '2026-08-02', completePairs: 9 })], [claim()])
    expect(feed.stats).toEqual({ questionsTracked: 25, matchedTests: 40, reportsPublished: 2, modelsCovered: 3 })
    expect(feed.reports[0]?.code).toBe('RPT-002')
    expect(feed.rows[0]?.id).toBe('claim-1')
    expect(feed.rows[0]?.rank).toBe(1)
    expect(feed.rows[0]?.models).toEqual(['gpt-4o'])
    expect(feed.rows[0]?.biasScore).toBe(0.8)
    expect(feed.rows[0]?.biasBand).toBe('high')
    expect(feed.rows[0]?.isNew).toBe(true)
    expect(feed.rows[0]?.reports[0]?.code).toBe('RPT-002')
  })

  it('links claims only to reports that really used their questions', () => {
    const feed = builder.build(board, [report()], [claim({ reports: [] })])
    expect(feed.rows[0]?.reports).toEqual([])
  })

  it('sorts by tests, bias, match rate, and newest, then re-ranks', () => {
    const feed = builder.build(board, [], [
      claim(),
      claim({ id: 'claim-2', testCount: 40, biasScore: 0.1, matchRate: 50, lastSeenAt: '2026-08-27' }),
    ])
    expect(builder.sort(feed.rows, 'tests')[0]?.id).toBe('claim-2')
    expect(builder.sort(feed.rows, 'bias')[0]?.id).toBe('claim-1')
    expect(builder.sort(feed.rows, 'match')[0]?.id).toBe('claim-1')
    expect(builder.sort(feed.rows, 'newest')[0]?.id).toBe('claim-2')
    expect(builder.sort(feed.rows, 'newest')[1]?.rank).toBe(2)
  })

  it('pages the ranked list to 20, 50, or 100', () => {
    const feed = builder.build(board, [], Array.from({ length: 25 }, (_, index) => claim({ id: `c-${index}` })))
    expect(builder.page(feed.rows, 20)).toHaveLength(20)
    expect(builder.page(feed.rows, 50)).toHaveLength(25)
  })
})
