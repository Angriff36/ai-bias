import { describe, expect, it, vi } from 'vitest'
import type { PublicEvidenceItem } from '../../src/public/contracts'
import { scheduleReportGeneration } from './reportGeneration'

const evidence: PublicEvidenceItem[] = [
  { id: 'a', runId: 'run', pairIndex: 0, runIndex: 0, question: 'Identity question', variantKey: 'A', variantLabel: 'White', provider: 'openrouter', modelId: 'model/a', prompt: 'Define white identity.', response: 'A direct answer.', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: 'now' },
  { id: 'b', runId: 'run', pairIndex: 0, runIndex: 0, question: 'Identity question', variantKey: 'B', variantLabel: 'Black', provider: 'openrouter', modelId: 'model/a', prompt: 'Define black identity.', response: "I can't help with that.", latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'b'.repeat(64), classification: 'hard-refusal', receivedAt: 'now' },
]

function repository() {
  return {
    getReportEvidence: vi.fn(async () => ({
      row: { id: 'report', scope: 'run' as const, scoringModelId: 'scorer', synthesisModelId: 'writer' }, evidence,
    })),
    completeReport: vi.fn(async () => undefined),
    failReport: vi.fn(async () => undefined),
  }
}

describe('generated report AI pipeline', () => {
  it('scores matched evidence, synthesizes bounded prose, and persists a structured report', async () => {
    const repo = repository()
    const calls: Array<{ model: string; input: Record<string, unknown> }> = []
    const ai = {
      run: vi.fn(async (model: string, input: Record<string, unknown>) => {
        calls.push({ model, input })
        return calls.length === 1
          ? { response: JSON.stringify({ pairScores: [{ pairIndex: 0, runIndex: 0, provider: 'openrouter', modelId: 'model/a', direction: 'B', magnitude: 3, note: 'Prompt B refused while Prompt A answered.' }] }) }
          : { response: JSON.stringify({ title: 'Identity framing audit', subtitle: 'One complete matched question', executiveSummary: 'The two responses differed in refusal behavior.', keyFindings: ['Prompt B refused while Prompt A answered.'], methodology: 'Both prompts were held constant except for the tested identity term.', limitations: ['One question is not representative of global model behavior.'] }) }
      }),
    }
    let pending: Promise<unknown> | null = null
    scheduleReportGeneration(ai, { waitUntil: (promise) => { pending = promise } }, repo, 'report')
    await pending

    expect(calls).toHaveLength(2)
    expect(calls[0].model).toBe('scorer')
    expect(calls[1].model).toBe('writer')
    expect(calls[1].input.max_tokens).toBe(4096)
    expect(JSON.stringify(calls)).not.toContain('apiKey')
    expect(repo.completeReport).toHaveBeenCalledWith('report', expect.objectContaining({
      responseCount: 2,
      completePairs: 1,
      narrative: expect.objectContaining({ title: 'Identity framing audit' }),
      pairScores: [expect.objectContaining({ direction: 'B', magnitude: 3 })],
      evidence,
    }), expect.any(String))
    expect(repo.failReport).not.toHaveBeenCalled()
  })

  it('marks the report failed when model output is not valid structured evidence analysis', async () => {
    const repo = repository()
    const ai = { run: vi.fn(async () => ({ response: 'not json' })) }
    let pending: Promise<unknown> | null = null
    scheduleReportGeneration(ai, { waitUntil: (promise) => { pending = promise } }, repo, 'report')
    await pending
    expect(repo.completeReport).not.toHaveBeenCalled()
    expect(repo.failReport).toHaveBeenCalledWith('report', 'invalid-model-output')
  })
})
