import { describe, expect, it, vi } from 'vitest'
import type { PublicEvidenceItem } from '../../src/public/contracts'
import { handleReportChunkFailure, processReportChunk, runReportGenerationStep } from './reportGeneration'

function evidenceRecord(overrides: Partial<PublicEvidenceItem> & Pick<PublicEvidenceItem, 'id' | 'pairIndex' | 'runIndex' | 'variantKey' | 'classification'>): PublicEvidenceItem {
  return {
    runId: 'run',
    question: `Question ${overrides.pairIndex}`,
    variantLabel: overrides.variantKey === 'A' ? 'White' : 'Black',
    provider: 'openrouter',
    modelId: 'model/a',
    prompt: `Prompt ${overrides.variantKey} ${overrides.pairIndex}`,
    response: overrides.classification === 'hard-refusal' ? "I can't help with that." : 'Direct answer.',
    latencyMs: 100,
    statusCode: 200,
    status: 'ok',
    sha256: `${overrides.id}${'a'.repeat(64)}`.slice(0, 64).replace(/[^a-f0-9]/g, 'a'),
    receivedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  }
}

function fixtureEvidence(pairCount: number): PublicEvidenceItem[] {
  const records: PublicEvidenceItem[] = []
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const asymmetric = pairIndex % 3 === 0
    records.push(
      evidenceRecord({ id: `a-${pairIndex}`, pairIndex, runIndex: 0, variantKey: 'A', classification: 'answered' }),
      evidenceRecord({
        id: `b-${pairIndex}`,
        pairIndex,
        runIndex: 0,
        variantKey: 'B',
        classification: asymmetric ? 'hard-refusal' : 'answered',
      }),
    )
  }
  return records
}

describe('generated report pipeline', () => {
  it('gives one model the study and report template, then completes in one call', async () => {
    const evidence = fixtureEvidence(1_000).map((item) => ({
      ...item,
      prompt: `${item.prompt} ${'p'.repeat(500)}`,
      response: `${item.response} ${'r'.repeat(800)}`,
    }))
    const judge = vi.fn(async () => { throw new Error('the judge pipeline must not run') })
    const reportModel = vi.fn(async (_modelId: string, _prompt: string) => JSON.stringify({
      title: 'Identity framing audit',
      subtitle: 'One matched question',
      executiveSummary: 'The matched answers were compared.',
      keyFindings: ['The judge found a measurable difference.'],
      methodology: 'A judge model scored the matched pair before synthesis.',
      limitations: ['One question is not representative of every context.'],
    }))
    const repository = {
      touchReportGeneration: vi.fn(async () => undefined),
      getReportEvidence: vi.fn(async () => ({
          row: {
            id: 'report-timebox',
            scope: 'run' as const,
            scoringModelId: 'z-ai/glm-5.3-flash',
            synthesisModelId: 'x-ai/grok-4.6',
          },
          evidence,
      })),
      completeReport: vi.fn(async () => undefined),
      failReport: vi.fn(async () => undefined),
    }

    await processReportChunk(
      { complete: reportModel },
      repository,
      'report-timebox',
      { complete: judge },
      'owner-a',
    )

    expect(judge).not.toHaveBeenCalled()
    expect(reportModel).toHaveBeenCalledTimes(1)
    expect(reportModel).toHaveBeenCalledWith(
      'x-ai/grok-4.6',
      expect.stringContaining('STUDY DATA:'),
      4096,
      { jsonObject: true },
    )
    expect(reportModel.mock.calls[0]?.[1]).toContain('Prompt A 0')
    expect(reportModel.mock.calls[0]?.[1]).toContain('Question 999')
    expect(reportModel.mock.calls[0]?.[1].length).toBeLessThan(600_000)
    expect(repository.completeReport).toHaveBeenCalledTimes(1)
    expect(repository.completeReport).toHaveBeenCalledWith(
      'report-timebox',
      expect.objectContaining({ evidence: [] }),
      expect.any(String),
      'owner-a',
    )
  })

  it('heartbeats the same lease owner while a long model call is in flight', async () => {
    vi.useFakeTimers()
    let finishReport!: (value: string) => void
    const reportModel = vi.fn(() => new Promise<string>((resolve) => { finishReport = resolve }))
    const repository = {
      touchReportGeneration: vi.fn(async () => undefined),
      getReportEvidence: vi.fn(async () => ({
        row: { id: 'report-long', scope: 'global' as const, scoringModelId: 'judge', synthesisModelId: 'writer' },
        evidence: fixtureEvidence(1),
      })),
      completeReport: vi.fn(async () => undefined),
      countPairScores: vi.fn(async () => 0),
      failReport: vi.fn(async () => undefined),
      releaseReportGeneration: vi.fn(async () => undefined),
    }

    try {
      const running = runReportGenerationStep(
        { complete: reportModel }, repository, 'report-long', { complete: vi.fn() }, 'owner-a',
      )
      await vi.advanceTimersByTimeAsync(30_000)
      expect(repository.touchReportGeneration).toHaveBeenCalledWith(
        'report-long', expect.any(String), 'owner-a',
      )
      expect(repository.touchReportGeneration.mock.calls.length).toBeGreaterThanOrEqual(2)
      finishReport(JSON.stringify({
        title: 'Report', subtitle: 'Study', executiveSummary: 'Summary.',
        keyFindings: ['Finding.'], methodology: 'One model reviewed the study.', limitations: ['Limited sample.'],
      }))
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
        evidence: fixtureEvidence(1),
      })),
      completeReport: vi.fn(async () => undefined),
      countPairScores: vi.fn(async () => 0),
      failReport: vi.fn(async () => undefined),
      releaseReportGeneration: vi.fn(async () => { throw new Error('temporary D1 outage') }),
    }

    await expect(runReportGenerationStep(
      { complete: vi.fn(async () => JSON.stringify({
        title: 'Report', subtitle: 'Study', executiveSummary: 'Summary.',
        keyFindings: ['Finding.'], methodology: 'One model reviewed the study.', limitations: ['Limited sample.'],
      })) },
      repository,
      'report-release',
      { complete: vi.fn() },
      'owner-a',
    )).resolves.toBeUndefined()
    expect(repository.releaseReportGeneration).toHaveBeenCalledWith('report-release', 'owner-a')
  })

  it('keeps a rate-limited model call pending so the open Reports tab can retry it', async () => {
    const repository = {
      getReportEvidence: vi.fn(async () => ({
        row: {
          id: 'report-checkpoint-retry', scope: 'global' as const,
          scoringModelId: 'z-ai/glm-5.3-flash', synthesisModelId: 'x-ai/grok-4.6',
        },
        evidence: fixtureEvidence(1),
      })),
      countPairScores: vi.fn(async () => 0),
      touchReportGeneration: vi.fn(async () => undefined),
      failReport: vi.fn(async () => undefined),
    }

    await handleReportChunkFailure(
      repository as never,
      'report-checkpoint-retry',
      new Error('OpenRouter request failed (429): rate limit'),
      'owner-a',
    )

    expect(repository.touchReportGeneration).toHaveBeenCalledWith(
      'report-checkpoint-retry', expect.any(String), 'owner-a',
    )
    expect(repository.failReport).not.toHaveBeenCalled()
  })
})
