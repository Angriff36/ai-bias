import { describe, expect, it, vi } from 'vitest'
import type { PublicEvidenceItem } from '../../src/public/contracts'
import { handleReportChunkFailure, runReportGenerationStep } from './reportGeneration'

function fixtureEvidence(): PublicEvidenceItem[] {
  const base = {
    runId: 'run', pairIndex: 0, runIndex: 0, question: 'Question', provider: 'openrouter', modelId: 'model/a',
    latencyMs: 1, statusCode: 200, status: 'ok' as const, sha256: 'a'.repeat(64),
    classification: 'answered' as const, receivedAt: 'now', response: 'Answer',
  }
  return [
    { ...base, id: 'a', variantKey: 'A', variantLabel: 'White', prompt: 'Prompt A' },
    { ...base, id: 'b', variantKey: 'B', variantLabel: 'Asian', prompt: 'Prompt B' },
  ]
}

describe('generated report pipeline leases', () => {
  it('heartbeats the same lease owner while a Batch API request is in flight', async () => {
    vi.useFakeTimers()
    let finishSubmit!: () => void
    const submit = vi.fn(() => new Promise<{ id: string; status: string }>((resolve) => {
      finishSubmit = () => resolve({ id: 'batch-1', status: 'validating' })
    }))
    const repository = {
      touchReportGeneration: vi.fn(async () => undefined),
      getReportEvidence: vi.fn(async () => ({
        row: { id: 'report-long', scope: 'global' as const, scoringModelId: 'judge', synthesisModelId: 'writer' },
        evidence: fixtureEvidence(),
      })),
      loadPairScores: vi.fn(async () => []),
      loadJudgeBatch: vi.fn(async () => null),
      saveJudgeBatch: vi.fn(async () => undefined),
      completeReport: vi.fn(async () => undefined),
      countPairScores: vi.fn(async () => 0),
      failReport: vi.fn(async () => undefined),
      releaseReportGeneration: vi.fn(async () => undefined),
    }

    try {
      const running = runReportGenerationStep(
        { complete: vi.fn() }, repository, 'report-long', { submit, retrieve: vi.fn() }, 'owner-a',
      )
      await vi.advanceTimersByTimeAsync(30_000)
      expect(repository.touchReportGeneration).toHaveBeenCalledWith('report-long', expect.any(String), 'owner-a')
      expect(repository.touchReportGeneration.mock.calls.length).toBeGreaterThanOrEqual(2)
      finishSubmit()
      await running
      expect(repository.releaseReportGeneration).toHaveBeenCalledWith('report-long', 'owner-a')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not turn a successful step into an error when best-effort lease release fails', async () => {
    const repository = {
      touchReportGeneration: vi.fn(async () => undefined),
      getReportEvidence: vi.fn(async () => ({
        row: { id: 'report-release', scope: 'global' as const, scoringModelId: 'judge', synthesisModelId: 'writer' },
        evidence: fixtureEvidence(),
      })),
      loadPairScores: vi.fn(async () => []),
      loadJudgeBatch: vi.fn(async () => null),
      saveJudgeBatch: vi.fn(async () => undefined),
      completeReport: vi.fn(async () => undefined),
      countPairScores: vi.fn(async () => 0),
      failReport: vi.fn(async () => undefined),
      releaseReportGeneration: vi.fn(async () => { throw new Error('temporary D1 outage') }),
    }

    await expect(runReportGenerationStep(
      { complete: vi.fn() }, repository, 'report-release',
      { submit: vi.fn(async () => ({ id: 'batch-1', status: 'validating' })), retrieve: vi.fn() }, 'owner-a',
    )).resolves.toBeUndefined()
    expect(repository.releaseReportGeneration).toHaveBeenCalledWith('report-release', 'owner-a')
  })

  it('keeps a rate-limited Batch API call pending so status polling can retry it', async () => {
    const repository = {
      getReportEvidence: vi.fn(async () => ({
        row: { id: 'report-retry', scope: 'global' as const, scoringModelId: 'judge', synthesisModelId: 'writer' },
        evidence: fixtureEvidence(),
      })),
      countPairScores: vi.fn(async () => 0),
      touchReportGeneration: vi.fn(async () => undefined),
      failReport: vi.fn(async () => undefined),
    }

    await handleReportChunkFailure(repository as never, 'report-retry', new Error('OpenRouter Batch request failed (429)'), 'owner-a')

    expect(repository.touchReportGeneration).toHaveBeenCalledWith('report-retry', expect.any(String), 'owner-a')
    expect(repository.failReport).not.toHaveBeenCalled()
  })
})
