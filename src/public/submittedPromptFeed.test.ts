import { describe, expect, it } from 'vitest'
import type { PublicLeaderboard } from './contracts'
import { SubmittedPromptFeedBuilder } from './submittedPromptFeed'

const base: PublicLeaderboard = {
  totals: { runs: 2, responses: 4, completePairs: 2, models: 1, questions: 1 },
  topQuestions: [
    { questionKey: 'does the model treat names differently', questionText: 'Does the model treat names differently?', runCount: 8, modelCount: 1, variantACount: 2, variantBCount: 2, lastSeenAt: '2026-08-26' },
  ],
  models: [],
  latestAnalysis: null,
  analysisPending: false,
  latestReport: null,
  reportPending: false,
  recentEvidence: [],
}

describe('SubmittedPromptFeedBuilder', () => {
  const builder = new SubmittedPromptFeedBuilder()

  it('uses grouped questions when no raw evidence is present', () => {
    const feed = builder.build(base)
    expect(feed.source).toBe('questions')
    expect(feed.rows[0]?.prompt).toBe('Does the model treat names differently?')
    expect(feed.rows[0]?.testCount).toBe(8)
    expect(feed.rows[0]?.status).toBe('complete')
  })

  it('prefers unique raw prompts and attaches the grouped question', () => {
    const feed = builder.build({
      ...base,
      recentEvidence: [
        {
          id: 'e1', runId: 'r1', pairIndex: 0, runIndex: 0, variantKey: 'A', variantLabel: 'A',
          provider: 'openrouter', modelId: 'openai/gpt-4o', prompt: 'Rank these two resumes.',
          response: 'ok', latencyMs: 10, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64),
          classification: 'answered', receivedAt: '2026-08-26T12:00:00Z',
          question: 'Does the model treat names differently?',
        },
        {
          id: 'e2', runId: 'r1', pairIndex: 0, runIndex: 0, variantKey: 'B', variantLabel: 'B',
          provider: 'openrouter', modelId: 'openai/gpt-4o', prompt: 'Rank these two resumes.',
          response: 'ok', latencyMs: 10, statusCode: 200, status: 'ok', sha256: 'b'.repeat(64),
          classification: 'answered', receivedAt: '2026-08-26T11:00:00Z',
          question: 'Does the model treat names differently?',
        },
      ],
    })
    expect(feed.source).toBe('evidence')
    expect(feed.rows).toHaveLength(1)
    expect(feed.rows[0]?.modelLabel).toBe('gpt-4o')
    expect(feed.rows[0]?.groupedQuestion).toBe('Does the model treat names differently?')
    expect(feed.rows[0]?.testCount).toBe(8)
  })

  it('sorts by most tested', () => {
    const rows = builder.build(base).rows.concat({
      id: 'low', prompt: 'A later prompt', groupedQuestion: null, questionKey: 'later',
      topic: 'other', status: 'pending', modelLabel: 'gpt-4o', testCount: 1, receivedAt: '2026-08-27',
    })
    expect(builder.filter(rows, 'all', 'most-tested')[0]?.testCount).toBe(8)
    expect(builder.filter(rows, 'all', 'newest')[0]?.prompt).toBe('A later prompt')
  })

  it('keeps a 20, 50, or 100 question window', () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      id: `q-${index}`, prompt: `Question ${index}`, groupedQuestion: null, questionKey: `q-${index}`,
      topic: 'other' as const, status: 'complete' as const, modelLabel: 'gpt-4o', testCount: 1, receivedAt: '2026-08-26',
    }))
    expect(builder.page(rows, 20)).toHaveLength(20)
    expect(builder.page(rows, 50)).toHaveLength(50)
    expect(builder.page(rows, 100)).toHaveLength(60)
  })
})
