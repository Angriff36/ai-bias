import { describe, expect, it, vi } from 'vitest'
import type { GeneratedReportPairScore, PublicEvidenceItem } from '../../src/public/contracts'
import { buildPairSampleId } from './matchedSampleIdentity'
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

const zeroScores = {
  dangerFraming: 0,
  sympathy: 0,
  skepticism: 0,
  collectiveBlame: 0,
  moralCondemnation: 0,
  antiStereotyping: 0,
  acknowledgesDiscrimination: 0,
}

function mockJudgeBatch(prompt: string): string {
  const cells = JSON.parse(prompt.split('CELLS:\n')[1] ?? '[]') as Array<{ pairSampleId: string }>
  return JSON.stringify({
    scores: cells.map((cell) => ({
      pairSampleId: cell.pairSampleId,
      variantA: zeroScores,
      variantB: { ...zeroScores, sympathy: 2 },
      note: 'The comparison answer was warmer.',
    })),
  })
}

describe('generated report pipeline', () => {
  it('checkpoints exactly one new pair per invocation before a later invocation synthesizes', async () => {
    const evidence = fixtureEvidence(3)
    let savedScores: GeneratedReportPairScore[] = []
    const judge = vi.fn(async (_modelId: string, prompt: string) => mockJudgeBatch(prompt))
    const reportModel = vi.fn(async (_modelId: string, _prompt: string) => JSON.stringify({
      title: 'Identity framing audit',
      subtitle: 'One matched question',
      executiveSummary: 'The matched answers were compared.',
      keyFindings: ['The judge found a measurable difference.'],
      methodology: 'A judge model scored the matched pair before synthesis.',
      limitations: ['One question is not representative of every context.'],
      sections: [{
        kind: 'case-study',
        heading: 'The strongest scored case',
        paragraphs: ['The comparison answer was warmer than the reference answer.'],
        pairSampleIds: [buildPairSampleId(evidence[0]!)],
      }],
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
      loadPairScores: vi.fn(async () => savedScores),
      upsertPairScores: vi.fn(async (_reportId: string, scores: GeneratedReportPairScore[]) => {
        const byId = new Map(savedScores.map((score) => [score.pairSampleId, score]))
        for (const score of scores) byId.set(score.pairSampleId, score)
        savedScores = [...byId.values()]
      }),
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

    expect(judge).toHaveBeenCalledWith('z-ai/glm-5.3-flash', expect.stringContaining('SCORING TASK'), 8192, { jsonObject: true })
    expect(savedScores).toHaveLength(1)
    expect(JSON.parse((judge.mock.calls[0]?.[1] ?? '').split('CELLS:\n')[1] ?? '[]')).toHaveLength(1)
    expect(reportModel).not.toHaveBeenCalled()
    expect(repository.completeReport).not.toHaveBeenCalled()

    await processReportChunk(
      { complete: reportModel }, repository, 'report-timebox', { complete: judge }, 'owner-a',
    )

    expect(judge).toHaveBeenCalledTimes(2)
    expect(savedScores).toHaveLength(2)
    expect(new Set(savedScores.map((score) => score.pairSampleId)).size).toBe(2)
    expect(reportModel).not.toHaveBeenCalled()

    await processReportChunk(
      { complete: reportModel }, repository, 'report-timebox', { complete: judge }, 'owner-a',
    )

    expect(judge).toHaveBeenCalledTimes(3)
    expect(savedScores).toHaveLength(3)
    expect(new Set(savedScores.map((score) => score.pairSampleId)).size).toBe(3)
    expect(reportModel).not.toHaveBeenCalled()
    expect(repository.completeReport).not.toHaveBeenCalled()

    await processReportChunk(
      { complete: reportModel }, repository, 'report-timebox', { complete: judge }, 'owner-a',
    )

    expect(judge).toHaveBeenCalledTimes(3)
    expect(reportModel).toHaveBeenCalledWith(
      'x-ai/grok-4.6', expect.stringContaining('"pooledDimensions"'), 4096, { jsonObject: true },
    )
    const synthesisPrompt = reportModel.mock.calls[0]?.[1] ?? ''
    expect(synthesisPrompt).toContain('"modelAggregates"')
    expect(synthesisPrompt).toContain('"repeatability"')
    expect(synthesisPrompt).toContain('"strongestExamples"')
    expect(synthesisPrompt).toContain('"counterexamples"')
    const synthesisData = JSON.parse(synthesisPrompt.split('DATA:\n')[1] ?? '{}') as {
      strongestExamples?: Array<{ pairSampleId: string }>
    }
    expect(synthesisData.strongestExamples?.[0]?.pairSampleId).toBe(buildPairSampleId(evidence[0]!))
    expect(synthesisPrompt).not.toContain('Direct answer.')
    expect(repository.completeReport).toHaveBeenCalledWith(
      'report-timebox',
      expect.objectContaining({
        scoringModelId: 'z-ai/glm-5.3-flash',
        synthesisModelId: 'x-ai/grok-4.6',
        pairScores: expect.arrayContaining([expect.objectContaining({ pairSampleId: buildPairSampleId(evidence[0]!) })]),
        evidence,
        narrative: expect.objectContaining({ sections: expect.arrayContaining([expect.objectContaining({ kind: 'case-study' })]) }),
      }),
      expect.any(String), 'owner-a',
    )
  })

  it('heartbeats the same lease owner while a long model call is in flight', async () => {
    vi.useFakeTimers()
    let finishJudge!: (value: string) => void
    const judge = vi.fn(() => new Promise<string>((resolve) => { finishJudge = resolve }))
    const repository = {
      touchReportGeneration: vi.fn(async () => undefined),
      getReportEvidence: vi.fn(async () => ({
        row: { id: 'report-long', scope: 'global' as const, scoringModelId: 'judge', synthesisModelId: 'writer' },
        evidence: fixtureEvidence(1),
      })),
      loadPairScores: vi.fn(async () => []),
      upsertPairScores: vi.fn(async () => undefined),
      completeReport: vi.fn(async () => undefined),
      countPairScores: vi.fn(async () => 0),
      failReport: vi.fn(async () => undefined),
      releaseReportGeneration: vi.fn(async () => undefined),
    }

    try {
      const running = runReportGenerationStep(
        { complete: vi.fn() }, repository, 'report-long', { complete: judge }, 'owner-a',
      )
      await vi.advanceTimersByTimeAsync(30_000)
      expect(repository.touchReportGeneration).toHaveBeenCalledWith(
        'report-long', expect.any(String), 'owner-a',
      )
      expect(repository.touchReportGeneration.mock.calls.length).toBeGreaterThanOrEqual(2)
      finishJudge(mockJudgeBatch(`SCORING TASK\nCELLS:\n${JSON.stringify([{ pairSampleId: buildPairSampleId(fixtureEvidence(1)[0]!) }])}`))
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
      loadPairScores: vi.fn(async () => []),
      upsertPairScores: vi.fn(async () => undefined),
      completeReport: vi.fn(async () => undefined),
      countPairScores: vi.fn(async () => 0),
      failReport: vi.fn(async () => undefined),
      releaseReportGeneration: vi.fn(async () => { throw new Error('temporary D1 outage') }),
    }

    await expect(runReportGenerationStep(
      { complete: vi.fn() },
      repository,
      'report-release',
      { complete: vi.fn(async (_modelId: string, prompt: string) => mockJudgeBatch(prompt)) },
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
