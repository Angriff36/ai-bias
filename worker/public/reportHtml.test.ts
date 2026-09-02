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
        sections: [
          {
            kind: 'case-study', heading: 'The clearest refusal split',
            paragraphs: ['The judge identified a one-sided refusal in the strongest case.'],
            pairSampleIds: ['run\u00000\u00000\u0000openrouter\u0000model/a'],
          },
          {
            kind: 'counterexample', heading: 'Where the pattern weakens',
            paragraphs: ['Not every scored comparison moved in the headline direction.'],
          },
        ],
      },
      models: [{ provider: 'openrouter', modelId: 'model/a', responses: 2, completePairs: 1, refusals: 1, errors: 0, truncated: 0 }],
      pairScores: [{
        pairSampleId: 'run\u00000\u00000\u0000openrouter\u0000model/a',
        variantAEvidenceId: 'e1',
        variantBEvidenceId: 'e2',
        pairIndex: 0, runIndex: 0, provider: 'openrouter', modelId: 'model/a',
        variantA: sampleDimensions,
        variantB: { ...sampleDimensions, sympathy: 0, acknowledgesDiscrimination: 0 },
        note: 'Prompt B refused.', direction: 'A', magnitude: 4,
      }],
      evidence: [
        { id: 'e1', runId: 'run', pairIndex: 0, runIndex: 0, question: 'Question 0', variantKey: 'A', variantLabel: 'White', provider: 'openrouter', modelId: 'model/a', prompt: '<img src=x onerror=alert(1)>', response: '<script>steal()</script>', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: 'now' },
        { id: 'e2', runId: 'run', pairIndex: 0, runIndex: 0, question: 'Question 0', variantKey: 'B', variantLabel: 'Black', provider: 'openrouter', modelId: 'model/a', prompt: 'B', response: "I can't help with that.", latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'b'.repeat(64), classification: 'hard-refusal', receivedAt: 'now' },
      ],
    }
    const html = renderReportHtml(document)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Question by question')
    expect(html).toContain('The headline numbers')
    expect(html).toContain('Answer tone')
    expect(html).toContain('Consistency and repeatability')
    expect(html).toContain('The clearest refusal split')
    expect(html).toContain('Where the pattern weakens')
    expect(html).toContain('class="case-evidence"')
    expect(html).toContain('class="dimtab model-score-grid"')
    expect(html).toContain('Scoring note')
    expect(html).toContain('White')
    expect(html).toContain('Black')
    expect(html).not.toContain('Variant A')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;')
    expect(html).toContain('details.mod{')
    expect(html).toContain('.note .mn{')
  })

  it('describes a single-pass report without claiming per-pair judge scores', () => {
    const document: GeneratedReportDocument = {
      schemaVersion: 1, id: 'single-pass', scope: 'global', generatedAt: '2026-08-30T00:00:00.000Z',
      scoringModelId: 'x-ai/grok-4.6', synthesisModelId: 'x-ai/grok-4.6', responseCount: 2, completePairs: 1, modelCount: 1,
      narrative: {
        title: 'One-pass report', subtitle: 'Matched evidence', executiveSummary: 'The model reviewed the study.',
        keyFindings: ['Answers differed.'], methodology: 'One model reviewed the study records and wrote this report in a single pass.', limitations: ['Small sample.'],
      },
      models: [{ provider: 'openrouter', modelId: 'model/a', responses: 2, completePairs: 1, refusals: 0, errors: 0, truncated: 0 }],
      pairScores: [],
      evidence: [{ id: 'e1', runId: 'run', pairIndex: 0, runIndex: 0, question: 'Question', variantKey: 'A', variantLabel: 'White', provider: 'openrouter', modelId: 'model/a', prompt: 'Prompt', response: 'Answer', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: 'now' }],
    }

    const html = renderReportHtml(document)

    expect(html).toContain('One report model reviewed the study records and wrote the report in a single pass.')
    expect(html).not.toContain('A judge model scored both answers')
    expect(html).not.toContain('Scores from')
    expect(html).not.toContain('Question by question')
  })
})
