import { describe, expect, it, vi } from 'vitest'
import type { GeneratedReportPairScore, PublicEvidenceItem } from '../../src/public/contracts'
import { buildPairSampleId } from './matchedSampleIdentity'
import { runReportFinalizationStep } from './reportGeneration'

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

function score(evidence: PublicEvidenceItem[]): GeneratedReportPairScore {
  const dimensions = {
    dangerFraming: 0, sympathy: 0, skepticism: 0, collectiveBlame: 0,
    moralCondemnation: 0, antiStereotyping: 0, acknowledgesDiscrimination: 0,
  }
  return {
    pairSampleId: buildPairSampleId(evidence[0]!), variantAEvidenceId: 'a', variantBEvidenceId: 'b',
    pairIndex: 0, runIndex: 0, provider: 'openrouter', modelId: 'model/a',
    variantA: dimensions, variantB: dimensions, note: 'The paired answers are substantively consistent.',
    direction: 'even', magnitude: 0,
  }
}

describe('generated report queue finalization', () => {
  it('uses stored judge scores for Grok synthesis and completes the existing rich report document', async () => {
    const evidence = fixtureEvidence()
    const repository = {
      touchReportGeneration: vi.fn(async () => undefined),
      getReportEvidence: vi.fn(async () => ({ row: {
        id: 'report-final', scope: 'run' as const, scoringModelId: 'openai/gpt-5.6-luna', synthesisModelId: 'x-ai/grok-4.6',
      }, evidence })),
      loadPairScores: vi.fn(async () => [score(evidence)]),
      completeReport: vi.fn(async () => undefined),
      failReport: vi.fn(async () => undefined),
      releaseReportGeneration: vi.fn(async () => undefined),
    }
    const synthesis = { complete: vi.fn(async () => JSON.stringify({
      title: 'Audit', subtitle: 'Paired evidence', executiveSummary: 'Summary.', keyFindings: ['Finding.'],
      methodology: 'Method.', limitations: ['Limit.'],
      sections: [{ kind: 'case-study', heading: 'Case', paragraphs: ['Evidence-led case.'], pairSampleIds: [buildPairSampleId(evidence[0]!)] }],
    })) }

    await runReportFinalizationStep(synthesis, repository, 'report-final', 'final-owner')

    expect(synthesis.complete).toHaveBeenCalledWith('x-ai/grok-4.6', expect.stringContaining('pairSampleId'), 4096, expect.any(Object))
    expect(repository.completeReport).toHaveBeenCalledWith('report-final', expect.objectContaining({
      scoringModelId: 'openai/gpt-5.6-luna', synthesisModelId: 'x-ai/grok-4.6',
      pairScores: [expect.objectContaining({ pairSampleId: buildPairSampleId(evidence[0]!) })], evidence,
    }), expect.any(String), 'final-owner')
    expect(repository.releaseReportGeneration).toHaveBeenCalledWith('report-final', 'final-owner')
  })
})
