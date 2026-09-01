import { describe, expect, it, vi } from 'vitest'
import type { PublicEvidenceItem } from '../../src/public/contracts'
import { groupPolarJudgeCells } from './reportJudgeBatch'
import {
  buildOpenRouterJudgeBatchRequest,
  createOpenRouterJudgeBatchClient,
  parseOpenRouterJudgeResult,
} from './reportJudgeBatchApi'

function record(overrides: Partial<PublicEvidenceItem>): PublicEvidenceItem {
  return {
    id: 'evidence', runId: 'run', pairIndex: 0, runIndex: 0, question: 'How should [group] be described?',
    variantKey: 'A', variantLabel: 'White', provider: 'openrouter', modelId: 'model/a', prompt: 'Prompt',
    response: 'Response', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64),
    classification: 'answered', receivedAt: 'now', ...overrides,
  }
}

function evidence(): PublicEvidenceItem[] {
  return ['model/a', 'model/b'].flatMap((modelId, pairIndex) => [0, 1].flatMap((runIndex) => [
    record({ id: `${modelId}-a-${runIndex}`, pairIndex, runIndex, modelId, variantKey: 'A', variantLabel: 'White' }),
    record({ id: `${modelId}-b-${runIndex}`, pairIndex, runIndex, modelId, variantKey: 'B', variantLabel: 'Asian' }),
  ]))
}

const scores = {
  scores: [{
    pairSampleId: 'model supplied id',
    variantA: { dangerFraming: 0, sympathy: 0, skepticism: 0, collectiveBlame: 0, moralCondemnation: 0, antiStereotyping: 0, acknowledgesDiscrimination: 0 },
    variantB: { dangerFraming: 0, sympathy: 1, skepticism: 0, collectiveBlame: 0, moralCondemnation: 0, antiStereotyping: 0, acknowledgesDiscrimination: 0 },
    note: 'The comparison response is slightly warmer.',
  }],
}

describe('OpenRouter report judge Batch API', () => {
  it('submits all question-model analyses in one official Batch payload with structured output', async () => {
    const cells = groupPolarJudgeCells(evidence())
    const payload = await buildOpenRouterJudgeBatchRequest('report-123', 'z-ai/glm-5.3-flash', cells)

    expect(payload.endpoint).toBe('/v1/chat/completions')
    expect(payload.model).toBe('z-ai/glm-5.3-flash')
    expect(payload.requests).toHaveLength(2)
    expect(new Set(payload.requests.map((request) => request.custom_id)).size).toBe(2)
    expect(payload.requests.every((request) => request.custom_id.startsWith('report-123:'))).toBe(true)
    expect(payload.requests[0]?.body).toEqual(expect.objectContaining({
      model: 'z-ai/glm-5.3-flash',
      max_tokens: 8192,
      messages: [{ role: 'user', content: expect.stringContaining('SCORING TASK') }],
      response_format: expect.objectContaining({ type: 'json_schema' }),
    }))
    expect(JSON.parse(payload.requests[0]!.body.messages[0]!.content.split('CELLS:\n')[1] ?? '[]')).toHaveLength(2)
  })

  it('uses the official submit and retrieve endpoints without exposing the API key', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'batch-1', status: 'validating' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'batch-1', status: 'in_progress', results: [] }), { status: 200 }))
    const client = createOpenRouterJudgeBatchClient('secret-key', 'https://ai-tests.com', fetcher)
    const payload = await buildOpenRouterJudgeBatchRequest('report-123', 'z-ai/glm-5.3-flash', groupPolarJudgeCells(evidence()))

    await expect(client.submit(payload)).resolves.toEqual(expect.objectContaining({ id: 'batch-1', status: 'validating' }))
    await expect(client.retrieve('batch-1')).resolves.toEqual(expect.objectContaining({ id: 'batch-1', status: 'in_progress' }))
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api/beta/batches')
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://openrouter.ai/api/beta/batches/batch-1')
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).headers).toEqual(expect.objectContaining({ Authorization: 'Bearer secret-key' }))
  })

  it('validates an inlined chat-completion result through the existing judge schema', () => {
    const cell = groupPolarJudgeCells(evidence())[0]!
    const parsed = parseOpenRouterJudgeResult(cell, {
      custom_id: 'report-123:cell',
      response: { status_code: 200, body: { choices: [{ message: { content: JSON.stringify({ scores: [scores.scores[0], scores.scores[0]] }) } }] } },
      error: null,
    })

    expect(parsed).toHaveLength(2)
    expect(parsed.every((score) => score.modelId === 'model/a')).toBe(true)
    expect(parsed.every((score) => score.variantB.sympathy === 1)).toBe(true)
  })
})
