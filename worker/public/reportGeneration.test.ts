import { describe, expect, it, vi } from 'vitest'
import { generatedReportDocumentSchema, type GeneratedReportPairScore, type PublicEvidenceItem } from '../../src/public/contracts'
import { buildPairSampleId } from './matchedSampleIdentity'
import { generateReport, handleReportChunkFailure, processReportChunk, runReportGenerationStep } from './reportGeneration'
import { RetryableReportCheckpointError } from './reportJudgeBatch'

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

function mockJudgeBatch(prompt: string) {
  const cells = JSON.parse(prompt.split('CELLS:\n')[1] ?? '[]') as Array<{ pairSampleId: string }>
  return JSON.stringify({
    scores: cells.map((cell) => ({
      pairSampleId: cell.pairSampleId,
      variantA: zeroScores,
      variantB: cell.pairSampleId.includes('\u00000\u0000') && cells.length
        ? { ...zeroScores, sympathy: 2 }
        : zeroScores,
      note: 'Observed difference in tone.',
    })),
  })
}

describe('generated report pipeline', () => {
  it('keeps the judge call on the connected request instead of aborting it at the background-task limit', async () => {
    const evidence = fixtureEvidence(1)
    let savedScores: GeneratedReportPairScore[] = []
    const judge = vi.fn(async (_modelId: string, prompt: string) => mockJudgeBatch(prompt))
    const synthesis = vi.fn(async () => JSON.stringify({
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
      loadPairScores: vi.fn(async () => savedScores),
      upsertPairScores: vi.fn(async (_reportId: string, scores: typeof savedScores) => {
        savedScores = [...savedScores, ...scores]
      }),
      completeReport: vi.fn(async () => undefined),
      failReport: vi.fn(async () => undefined),
    }

    await processReportChunk(
      { complete: synthesis },
      repository,
      'report-timebox',
      { complete: judge },
      'owner-a',
    )

    expect(judge).toHaveBeenCalledWith(
      'z-ai/glm-5.3-flash',
      expect.stringContaining('SCORING TASK'),
      8192,
      { jsonObject: true },
    )
    expect(synthesis).not.toHaveBeenCalled()
    expect(repository.completeReport).not.toHaveBeenCalled()
    expect(repository.upsertPairScores).toHaveBeenCalledTimes(1)
    expect(repository.touchReportGeneration).toHaveBeenCalledTimes(2)
    expect(savedScores).toHaveLength(1)

    await processReportChunk(
      { complete: synthesis },
      repository,
      'report-timebox',
      { complete: judge },
      'owner-a',
    )

    expect(judge).toHaveBeenCalledTimes(1)
    expect(synthesis).toHaveBeenCalledWith(
      'x-ai/grok-4.6',
      expect.stringContaining('DATA:'),
      4096,
      { jsonObject: true },
    )
    expect(repository.upsertPairScores).toHaveBeenCalledTimes(1)
    expect(repository.completeReport).toHaveBeenCalledTimes(1)
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
      finishJudge(mockJudgeBatch('SCORING TASK\nCELLS:\n' + JSON.stringify([{ pairSampleId: buildPairSampleId(fixtureEvidence(1)[0]!) }])))
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

  it('judges pairs in batches then synthesizes from aggregates only', async () => {
    const evidence = fixtureEvidence(24)
    const judge = vi.fn(async (_modelId: string, prompt: string) => mockJudgeBatch(prompt))
    const synthesis = vi.fn(async () => JSON.stringify({
      title: 'Identity framing audit',
      subtitle: 'Twenty-four matched questions',
      executiveSummary: 'Judge scores and refusal counts show uneven treatment.',
      keyFindings: ['Several matched pairs showed refusal on only one variant.'],
      methodology: 'A judge model scored each pair on seven fixed dimensions; this narrative used aggregates only.',
      limitations: ['Observed sample may not represent all deployment contexts.'],
    }))
    const judgeModels = { complete: judge }
    const synthesisModels = { complete: synthesis }

    const result = await generateReport(synthesisModels, {
      row: {
        id: 'report-many',
        scope: 'run',
        scoringModelId: 'z-ai/glm-5.3-flash',
        synthesisModelId: 'x-ai/grok-4.6',
      },
      evidence,
    }, judgeModels)
    expect('status' in result).toBe(false)
    const document = result as Exclude<typeof result, { status: 'partial' }>

    expect(judge.mock.calls.length).toBeGreaterThan(0)
    expect(judge.mock.calls.every(([modelId, prompt]) => (
      modelId === 'z-ai/glm-5.3-flash' && prompt.includes('SCORING TASK')
    ))).toBe(true)
    expect(synthesis).toHaveBeenCalledTimes(1)
    expect(synthesis).toHaveBeenCalledWith('x-ai/grok-4.6', expect.stringContaining('DATA:'), 4096, { jsonObject: true })
    expect(document.pairScores).toHaveLength(24)
    expect(document.pairScores.every((score) => score.note.length > 0)).toBe(true)
    expect(document.scoringModelId).toBe('z-ai/glm-5.3-flash')
    expect(document.synthesisModelId).toBe('x-ai/grok-4.6')
    expect(generatedReportDocumentSchema.safeParse(document).success).toBe(true)

    const firstA = evidence.find((item) => item.variantKey === 'A')!
    expect(document.pairScores.some((score) => score.pairSampleId === buildPairSampleId(firstA))).toBe(true)
  })

  it('marks invalid synthesis output as a generation failure path', async () => {
    const evidence = fixtureEvidence(1)
    const judgeModels = {
      complete: vi.fn(async (_modelId: string, prompt: string) => mockJudgeBatch(prompt)),
    }
    const synthesis = vi.fn(async () => 'not json')
    await expect(generateReport(
      { complete: synthesis },
      {
        row: {
          id: 'report-bad',
          scope: 'run',
          scoringModelId: 'z-ai/glm-5.3-flash',
          synthesisModelId: 'x-ai/grok-4.6',
        },
        evidence,
      },
      judgeModels,
    )).rejects.toThrow('Report model returned invalid JSON.')
    expect(synthesis).toHaveBeenCalledTimes(1)
  })

  it('keeps a checkpoint outage pending so the open Reports tab can retry it', async () => {
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
      new RetryableReportCheckpointError(new Error('D1 checkpoint unavailable')),
      'owner-a',
    )

    expect(repository.touchReportGeneration).toHaveBeenCalledWith(
      'report-checkpoint-retry', expect.any(String), 'owner-a',
    )
    expect(repository.failReport).not.toHaveBeenCalled()
  })
})
