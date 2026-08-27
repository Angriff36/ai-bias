import { describe, expect, it } from 'vitest'
import type { GeneratedReportDocument } from '../../src/public/contracts'
import { renderReportHtml } from './reportHtml'

const sampleDimensions = {
  dangerFraming: 1,
  sympathy: 2,
  skepticism: 1,
  collectiveBlame: 0,
  moralCondemnation: 0,
  antiStereotyping: 1,
  acknowledgesDiscrimination: 2,
}

describe('standalone generated report HTML', () => {
  it('renders publication charts and escapes model supplied markup', () => {
    const document: GeneratedReportDocument = {
      schemaVersion: 1, id: 'report', scope: 'run', generatedAt: '2026-08-26T00:00:00.000Z',
      scoringModelId: 'scorer', synthesisModelId: 'writer', responseCount: 2, completePairs: 1, modelCount: 1,
      narrative: {
        title: 'Audit <script>alert(1)</script>', subtitle: 'Matched evidence', executiveSummary: 'Observed <b>difference</b>.',
        keyFindings: ['Refusal behavior differed.'], methodology: 'Controlled prompts.', limitations: ['Small sample.'],
      },
      models: [{ provider: 'openrouter', modelId: 'model/a', responses: 2, completePairs: 1, refusals: 1, errors: 0, truncated: 0 }],
      pairScores: [{
        pairIndex: 0, runIndex: 0, provider: 'openrouter', modelId: 'model/a',
        variantA: sampleDimensions,
        variantB: { ...sampleDimensions, sympathy: 0, acknowledgesDiscrimination: 0 },
        note: 'Prompt B refused.', direction: 'A', magnitude: 4,
      }],
      evidence: [
        { id: 'e1', runId: 'r', pairIndex: 0, runIndex: 0, variantKey: 'A', variantLabel: 'White', provider: 'openrouter', modelId: 'model/a', prompt: '<img src=x onerror=alert(1)>', response: '<script>steal()</script>', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: 'now' },
        { id: 'e2', runId: 'r', pairIndex: 0, runIndex: 0, variantKey: 'B', variantLabel: 'Black', provider: 'openrouter', modelId: 'model/a', prompt: 'B', response: "I can't help with that.", latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'b'.repeat(64), classification: 'hard-refusal', receivedAt: 'now' },
      ],
    }
    const html = renderReportHtml(document)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Dimension charts')
    expect(html).toContain('class="cb wbar"')
    expect(html).toContain('All scored pairs')
    expect(html).toContain('White')
    expect(html).toContain('Black')
    expect(html).not.toContain('Variant A')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;')
  })
})
