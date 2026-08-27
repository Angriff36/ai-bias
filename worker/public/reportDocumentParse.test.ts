import { describe, expect, it } from 'vitest'
import type { GeneratedReportDocument, PublicEvidenceItem } from '../../src/public/contracts'
import { parseStoredReportDocument } from './reportDocumentParse'

function legacyDocument(): GeneratedReportDocument {
  const evidence: PublicEvidenceItem[] = [
    {
      id: 'a1', runId: 'run-1', pairIndex: 0, runIndex: 0, question: 'Capitalize white?',
      variantKey: 'A', variantLabel: 'White', provider: 'openrouter', modelId: 'gpt-4',
      prompt: 'Capitalize white?', response: 'It depends.', latencyMs: 10, statusCode: 200,
      status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: '2026-08-27T00:00:00.000Z',
    },
    {
      id: 'b1', runId: 'run-1', pairIndex: 0, runIndex: 0, question: 'Capitalize white?',
      variantKey: 'B', variantLabel: 'Asian', provider: 'openrouter', modelId: 'gpt-4',
      prompt: 'Capitalize Asian?', response: 'Yes.', latencyMs: 10, statusCode: 200,
      status: 'ok', sha256: 'b'.repeat(64), classification: 'answered', receivedAt: '2026-08-27T00:00:00.000Z',
    },
  ]
  return {
    schemaVersion: 1,
    id: 'report-1',
    scope: 'run',
    generatedAt: '2026-08-27T00:00:00.000Z',
    scoringModelId: 'semantic-text-analysis',
    synthesisModelId: 'x-ai/grok-4.6',
    responseCount: 2,
    completePairs: 1,
    modelCount: 1,
    narrative: {
      title: 'Legacy report',
      subtitle: 'Matched evidence',
      executiveSummary: 'Summary',
      keyFindings: ['Capitalization guidance differed.'],
      methodology: 'Method',
      limitations: ['Small sample.'],
    },
    models: [{ provider: 'openrouter', modelId: 'gpt-4', responses: 2, completePairs: 1, refusals: 0, errors: 0, truncated: 0 }],
    pairScores: [{
      pairIndex: 0,
      runIndex: 0,
      provider: 'openrouter',
      modelId: 'gpt-4',
      variantA: { dangerFraming: 0, sympathy: 1, skepticism: 2, collectiveBlame: 0, moralCondemnation: 0, antiStereotyping: 0, acknowledgesDiscrimination: 0 },
      variantB: { dangerFraming: 0, sympathy: 1, skepticism: 0, collectiveBlame: 0, moralCondemnation: 0, antiStereotyping: 0, acknowledgesDiscrimination: 0 },
      note: 'Measured semantic differences.',
      direction: 'A',
      magnitude: 2,
    } as GeneratedReportDocument['pairScores'][number]],
    evidence,
  }
}

describe('parseStoredReportDocument', () => {
  it('upgrades legacy pair scores missing sample identity fields', () => {
    const legacy = legacyDocument()
    const legacyScore = {
      pairIndex: legacy.pairScores[0].pairIndex,
      runIndex: legacy.pairScores[0].runIndex,
      provider: legacy.pairScores[0].provider,
      modelId: legacy.pairScores[0].modelId,
      variantA: legacy.pairScores[0].variantA,
      variantB: legacy.pairScores[0].variantB,
      note: legacy.pairScores[0].note,
      direction: legacy.pairScores[0].direction,
      magnitude: legacy.pairScores[0].magnitude,
    }
    const stored = JSON.stringify({ ...legacy, pairScores: [legacyScore] })
    const parsed = parseStoredReportDocument(stored)
    expect(parsed?.pairScores[0]?.pairSampleId).toContain('run-1')
    expect(parsed?.pairScores[0]?.variantAEvidenceId).toBe('a1')
    expect(parsed?.pairScores[0]?.variantBEvidenceId).toBe('b1')
  })
})
