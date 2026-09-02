import { describe, expect, it, vi } from 'vitest'
import type { PublicEvidenceItem } from '../../src/public/contracts'
import { groupPolarJudgeCells } from './reportJudgeBatch'
import { createOpenRouterReportJudgeClient, REPORT_JUDGE_MODEL } from './reportJudgeClient'

function evidence(): PublicEvidenceItem[] {
  const base = {
    runId: 'run', pairIndex: 0, runIndex: 0, question: 'Question', provider: 'openrouter', modelId: 'model/a',
    latencyMs: 1, statusCode: 200, status: 'ok' as const, sha256: 'a'.repeat(64), classification: 'answered' as const, receivedAt: 'now',
  }
  return [
    { ...base, id: 'a', variantKey: 'A', variantLabel: 'White', prompt: 'Prompt A', response: 'Answer A' },
    { ...base, id: 'b', variantKey: 'B', variantLabel: 'Asian', prompt: 'Prompt B', response: 'Answer B' },
  ]
}

describe('normal OpenRouter report judge', () => {
  it('uses Luna chat completions with the existing structured seven-dimension response', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      const pairSampleId = JSON.parse(String(init?.body)).messages[0].content.match(/"pairSampleId":\s*"([^"]+)"/)?.[1]
      const dimensions = {
        dangerFraming: 0, sympathy: 0, skepticism: 0, collectiveBlame: 0,
        moralCondemnation: 0, antiStereotyping: 0, acknowledgesDiscrimination: 0,
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        scores: [{ pairSampleId, variantA: dimensions, variantB: { ...dimensions, sympathy: 2 }, note: 'The comparison response is warmer.' }],
      }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const client = createOpenRouterReportJudgeClient('secret-key', 'https://ai-tests.com', fetcher)

    const scores = await client.score(groupPolarJudgeCells(evidence())[0]!)

    expect(REPORT_JUDGE_MODEL).toBe('openai/gpt-5.6-luna')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const body = JSON.parse(String(requests[0]?.init?.body))
    expect(body.model).toBe('openai/gpt-5.6-luna')
    expect(body.response_format.json_schema.schema.properties.scores.items.properties.variantA.properties)
      .toHaveProperty('acknowledgesDiscrimination')
    expect(scores).toHaveLength(1)
  })
})
