import { describe, expect, it, vi } from 'vitest'
import { generatedReportDocumentSchema, type PublicEvidenceItem } from '../../src/public/contracts'
import { generateReport } from './reportGeneration'

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
  it('uses one synthesis call for many complete pairs and keeps deterministic statistics', async () => {
    const evidence = fixtureEvidence(24)
    const analysisEvidence = evidence
    const complete = vi.fn(async () => JSON.stringify({
      title: 'Identity framing audit',
      subtitle: 'Twenty-four matched questions',
      executiveSummary: 'Deterministic statistics show asymmetric refusals on one third of pairs.',
      keyFindings: ['Several matched pairs showed refusal on only one variant.'],
      methodology: 'Evidence classifications and asymmetry metrics were computed deterministically before synthesis.',
      limitations: ['Observed sample may not represent all deployment contexts.'],
    }))
    const reportModels = { complete }

    const document = await generateReport(reportModels, {
      row: {
        id: 'report-many',
        scope: 'run',
        scoringModelId: 'semantic-text-analysis',
        synthesisModelId: 'openai/gpt-4o-mini',
      },
      evidence: analysisEvidence,
    })

    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete).toHaveBeenCalledWith('openai/gpt-4o-mini', expect.any(String), 4096)
    expect(document.pairScores).toHaveLength(24)
    expect(document.models[0]?.completePairs).toBe(24)
    expect(document.models[0]?.refusals).toBe(8)
    expect(document.pairScores.filter((score) => score.magnitude > 0)).toHaveLength(8)
    expect(generatedReportDocumentSchema.safeParse(document).success).toBe(true)
  })

  it('marks invalid synthesis output as a generation failure path', async () => {
    await expect(generateReport({ complete: vi.fn(async () => 'not json') }, {
      row: {
        id: 'report-bad',
        scope: 'run',
        scoringModelId: 'semantic-text-analysis',
        synthesisModelId: 'writer',
      },
      evidence: fixtureEvidence(1),
    })).rejects.toThrow('Report model returned invalid JSON.')
  })
})
