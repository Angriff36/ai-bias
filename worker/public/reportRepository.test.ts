import { describe, expect, it, vi } from 'vitest'
import type { PublicEvidenceItem } from '../../src/public/contracts'
import type { D1DatabaseLike, D1Result, D1Statement } from './d1'
import { GeneratedReportRepository, completeQuestionCount, summarizeReportModels } from './reportRepository'

const record = (overrides: Partial<PublicEvidenceItem>): PublicEvidenceItem => ({
  id: 'evidence-a', runId: 'run-a', pairIndex: 0, runIndex: 0, variantKey: 'A', variantLabel: 'Prompt A',
  provider: 'openrouter', modelId: 'model/a', prompt: 'Prompt A', response: 'Answered', latencyMs: 10,
  statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: '2026-08-26T00:00:00.000Z',
  ...overrides,
})

describe('generated report evidence preparation', () => {
  it('counts a question only when one model repeat has both variants', () => {
    const evidence = [
      record({ id: 'a0', pairIndex: 0, variantKey: 'A' }),
      record({ id: 'b0', pairIndex: 0, variantKey: 'B' }),
      record({ id: 'a1', pairIndex: 1, variantKey: 'A' }),
      record({ id: 'b1-other-model', pairIndex: 1, variantKey: 'B', modelId: 'model/b' }),
    ]
    expect(completeQuestionCount(evidence)).toBe(1)
  })

  it('summarizes refusal, error, truncation, and complete-pair evidence per model', () => {
    const evidence = [
      record({ id: 'a', variantKey: 'A' }),
      record({ id: 'b', variantKey: 'B', classification: 'hard-refusal', truncated: true }),
      record({ id: 'c', pairIndex: 1, modelId: 'model/b', status: 'error', classification: 'error' }),
    ]
    expect(summarizeReportModels(evidence)).toEqual([
      { provider: 'openrouter', modelId: 'model/a', responses: 2, completePairs: 1, refusals: 1, errors: 0, truncated: 1 },
      { provider: 'openrouter', modelId: 'model/b', responses: 1, completePairs: 0, refusals: 0, errors: 1, truncated: 0 },
    ])
  })

  it('loads legacy watermark global evidence when cohort snapshot is absent', async () => {
    const evidenceRows = [
      record({ id: 'first', receivedAt: '2026-08-26T00:00:00.000Z' }),
      record({ id: 'second', receivedAt: '2026-08-26T00:00:01.000Z' }),
      record({ id: 'third', receivedAt: '2026-08-26T00:00:02.000Z' }),
    ].map((item) => ({
      id: item.id, run_id: item.runId, pair_index: item.pairIndex, run_index: item.runIndex, question: item.question ?? null,
      variant_key: item.variantKey, variant_label: item.variantLabel, provider: item.provider, model_id: item.modelId,
      prompt: item.prompt, response: item.response, latency_ms: item.latencyMs, status_code: item.statusCode, status: item.status,
      error_message: null, truncated: 0, evidence_sha256: item.sha256, classification: item.classification, received_at: item.receivedAt,
    }))
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        const makeStatement = (limit?: unknown): D1Statement => {
          const row = {
            id: 'legacy-global', scope: 'global', public_run_id: null, response_watermark: 2, cohort_fingerprint: null,
            cohort_snapshot_json: null, status: 'pending', scoring_model_id: 'semantic-text-analysis', synthesis_model_id: 'x-ai/grok-4.6',
            title: null, structured_json: null, created_at: '2026-08-27T00:00:00.000Z', completed_at: null,
          }
          return {
            bind: (...args: unknown[]) => makeStatement(args[0]),
            first: async <T>() => row as T,
            all: async <T>() => ({ results: (sql.includes('LIMIT') ? evidenceRows.slice(0, Number(limit)) : evidenceRows) as T[] }),
            run: async <T>() => ({ meta: { changes: 1 } }) as D1Result<T>,
          }
        }
        return makeStatement()
      },
      batch: async (statements) => statements.map(() => ({ meta: { changes: 1 } })),
    }
    const repo = new GeneratedReportRepository(db)
    const loaded = await repo.getReportEvidence('legacy-global')
    expect(loaded.evidence.map((item) => item.id)).toEqual(['first', 'second'])
  })

  it('restarts a zero-progress pending report after the worker lease expires', async () => {
    const row = {
      id: 'pending-report', scope: 'global', public_run_id: null, response_watermark: 1,
      cohort_fingerprint: null, cohort_snapshot_json: null, status: 'pending', error_code: null,
      scoring_model_id: 'z-ai/glm-5.3-flash', synthesis_model_id: 'x-ai/grok-4.6',
      title: null, structured_json: null, created_at: '2026-08-30T15:00:00.000Z', completed_at: null,
    }
    const updates: unknown[][] = []
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        let bindings: unknown[] = []
        const statement: D1Statement = {
          bind: (...args: unknown[]) => { bindings = args; return statement },
          first: async <T>() => (sql.includes('COUNT(*)') ? { count: 0 } : row) as T,
          all: async <T>() => ({ results: [] as T[] }),
          run: async <T>() => { updates.push(bindings); return { meta: { changes: 1 } } as D1Result<T> },
        }
        return statement
      },
      batch: async (statements) => statements.map(() => ({ meta: { changes: 1 } })),
    }

    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-30T15:00:50.000Z'))
    let prepared
    try {
      prepared = await new GeneratedReportRepository(db).prepareReportGeneration(
        'pending-report',
        '2026-08-30T15:00:50.000Z',
      )
    } finally {
      dateNow.mockRestore()
    }

    expect(prepared?.started).toBe(true)
    expect(updates).toContainEqual(['2026-08-30T15:00:50.000Z', 'pending-report'])
  })
})
