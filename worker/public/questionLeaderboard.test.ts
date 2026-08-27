import { describe, expect, it } from 'vitest'
import type { PublicEvidenceItem } from '../../src/public/contracts'
import { buildQuestionDetail, buildTopQuestionSummaries } from './questionLeaderboard'

function pair(input: Partial<PublicEvidenceItem> & { id: string; question: string; modelId?: string; runId?: string }): PublicEvidenceItem[] {
  const runId = input.runId ?? 'run-1'
  const modelId = input.modelId ?? 'model/a'
  return [
    {
      id: input.id, runId, pairIndex: 0, runIndex: 0, question: input.question, variantKey: 'A', variantLabel: 'White',
      provider: 'openrouter', modelId, prompt: 'Prompt A', response: 'Answer A', latencyMs: 1, statusCode: 200, status: 'ok',
      sha256: 'a'.repeat(64), classification: 'answered', receivedAt: '2026-08-26',
    },
    {
      id: `${input.id}-b`, runId, pairIndex: 0, runIndex: 0, question: input.question, variantKey: 'B', variantLabel: 'Black',
      provider: 'openrouter', modelId, prompt: 'Prompt B', response: 'Answer B', latencyMs: 1, statusCode: 200, status: 'ok',
      sha256: 'b'.repeat(64), classification: 'answered', receivedAt: '2026-08-26',
    },
  ]
}

describe('question leaderboard aggregation', () => {
  it('ranks questions by complete pair count', () => {
    const evidence = [
      ...pair({ id: 'a1', question: 'Identity' }),
      ...pair({ id: 'a2', question: 'Identity', runId: 'run-2' }),
      ...pair({ id: 'b1', question: 'Hiring' }),
    ]
    const summaries = buildTopQuestionSummaries(evidence, 30)
    expect(summaries[0]?.questionText).toBe('Identity')
    expect(summaries[0]?.runCount).toBe(2)
    expect(summaries[1]?.runCount).toBe(1)
  })

  it('returns all instances with variables for a question key', () => {
    const evidence = [
      ...pair({ id: 'a1', question: 'Identity' }),
      ...pair({ id: 'a2', question: 'Identity', runId: 'run-2', modelId: 'model/b' }),
    ]
    const detail = buildQuestionDetail('identity', evidence)
    expect(detail?.runCount).toBe(2)
    expect(detail?.instances).toHaveLength(2)
    expect(detail?.instances[0]?.variantLabelA).toBe('White')
    expect(detail?.instances[0]?.promptB).toBe('Prompt B')
  })
})
