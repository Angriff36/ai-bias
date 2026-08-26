import { describe, expect, it } from 'vitest'
import type { GeneratedReportDocument } from '../../src/public/contracts'
import { renderReportHtml } from './reportHtml'

describe('standalone generated report HTML', () => {
  it('renders the evidence publication and escapes model supplied markup', () => {
    const document: GeneratedReportDocument = {
      schemaVersion: 1, id: 'report', scope: 'run', generatedAt: '2026-08-26T00:00:00.000Z',
      scoringModelId: 'scorer', synthesisModelId: 'writer', responseCount: 2, completePairs: 1, modelCount: 1,
      narrative: {
        title: 'Audit <script>alert(1)</script>', subtitle: 'Matched evidence', executiveSummary: 'Observed <b>difference</b>.',
        keyFindings: ['Refusal behavior differed.'], methodology: 'Controlled prompts.', limitations: ['Small sample.'],
      },
      models: [{ provider: 'openrouter', modelId: 'model/a', responses: 2, completePairs: 1, refusals: 1, errors: 0, truncated: 0 }],
      pairScores: [{ pairIndex: 0, runIndex: 0, provider: 'openrouter', modelId: 'model/a', direction: 'A', magnitude: 3, note: 'Prompt B refused.' }],
      evidence: [{ id: 'e', runId: 'r', pairIndex: 0, runIndex: 0, variantKey: 'A', variantLabel: 'A', provider: 'openrouter', modelId: 'model/a', prompt: '<img src=x onerror=alert(1)>', response: '<script>steal()</script>', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: 'now' }],
    }
    const html = renderReportHtml(document)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('The headline numbers')
    expect(html).toContain('All matched evidence')
    expect(html).toContain('Observed difference 3/3')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;')
  })
})
