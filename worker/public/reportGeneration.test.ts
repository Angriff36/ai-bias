import { describe, expect, it, vi } from 'vitest'
import { generatedReportDocumentSchema, type PublicEvidenceItem } from '../../src/public/contracts'
import { buildPairSampleId } from './matchedSampleIdentity'
import { generateReport, processReportChunk } from './reportGeneration'

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
  it('ends a worker scoring chunk before the 30-second waitUntil lifetime', async () => {
    const evidence = fixtureEvidence(12)
    let elapsedMs = 0
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => elapsedMs)
    const judge = vi.fn(async (_modelId: string, prompt: string) => {
      elapsedMs += 5_000
      return mockJudgeBatch(prompt)
    })
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
      loadPairScores: vi.fn(async () => []),
      upsertPairScores: vi.fn(async () => undefined),
      completeReport: vi.fn(async () => undefined),
      failReport: vi.fn(async () => undefined),
    }

    try {
      await processReportChunk(
        { complete: vi.fn(async () => { throw new Error('Synthesis must wait for the next chunk.') }) },
        repository,
        'report-timebox',
        { complete: judge },
      )
    } finally {
      dateNow.mockRestore()
    }

    expect(judge).toHaveBeenCalledTimes(5)
    expect(repository.completeReport).not.toHaveBeenCalled()
    expect(repository.upsertPairScores).toHaveBeenLastCalledWith(
      'report-timebox',
      expect.arrayContaining([expect.objectContaining({ pairSampleId: expect.any(String) })]),
    )
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
})
