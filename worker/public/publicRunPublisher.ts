import type { PublicEvidenceInput, PublicSubmission } from '../../src/public/contracts'
import { classifyPublicEvidence, normalizeSubmission, submissionHashMaterial } from '../../src/public/normalize'
import { normalizeQuestionKey } from '../../src/public/questionKeys'
import { thresholdsCrossed } from './analysis'
import type { D1DatabaseLike, D1Statement } from './d1'
import { PublicRunPublishPlan } from './publicRunPublishPlan'
import { aggregateSubmission, type ModelContribution, totalCompletePairs } from './publicSubmissionStats'
import { invalidatePublicReadCache } from './readCache'

export type PublicPublishResult = {
  runId: string
  duplicate: boolean
  crossedThresholds: number[]
}

const n = (value: unknown) => Number(value ?? 0)
const s = (value: unknown) => String(value ?? '')

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function contributionDelta(before: ModelContribution[], after: ModelContribution[]): ModelContribution[] {
  const prior = new Map(before.map((item) => [`${item.provider}\u0000${item.modelId}`, item]))
  return after.map((item) => {
    const previous = prior.get(`${item.provider}\u0000${item.modelId}`)
    if (!previous) return item
    return {
      ...item,
      responseCount: item.responseCount - previous.responseCount,
      completePairs: item.completePairs - previous.completePairs,
      asymmetricPairs: item.asymmetricPairs - previous.asymmetricPairs,
      answeredCount: item.answeredCount - previous.answeredCount,
      refusalCount: item.refusalCount - previous.refusalCount,
      errorCount: item.errorCount - previous.errorCount,
      truncatedCount: item.truncatedCount - previous.truncatedCount,
      latencySumMs: item.latencySumMs - previous.latencySumMs,
    }
  }).filter((item) => item.responseCount > 0 || item.completePairs > 0)
}

export class PublicRunPublisher {
  constructor(private readonly db: D1DatabaseLike) {}

  async publish(raw: PublicSubmission, receivedAt: string): Promise<PublicPublishResult> {
    const submission = normalizeSubmission(raw)
    const hash = await sha256(submissionHashMaterial(submission))
    const hashed = await this.db.prepare('SELECT id FROM public_runs WHERE submission_hash = ?').bind(hash).first<{ id: string }>()
    const existingHashes = raw.continueRunId ? await this.existingHashes(submission.records) : new Set<string>()
    const action = PublicRunPublishPlan.decide({
      hashedRunId: hashed?.id ?? null,
      continueRunId: raw.continueRunId,
      records: submission.records,
      existingEvidenceHashes: existingHashes,
    })
    if (action.kind === 'reuse' || action.kind === 'append-empty') {
      return { runId: action.runId, duplicate: true, crossedThresholds: [] }
    }
    if (action.kind === 'append') return this.append(action.runId, submission.source, action.records, receivedAt)
    return this.create(submission, hash, receivedAt)
  }

  private async create(submission: PublicSubmission, hash: string, receivedAt: string): Promise<PublicPublishResult> {
    const runId = crypto.randomUUID()
    const contributions = aggregateSubmission(submission)
    const completePairs = totalCompletePairs(contributions)
    const before = await this.globalCompletePairs()
    const statements: D1Statement[] = [
      this.db.prepare('INSERT INTO public_runs (id, submission_hash, source, created_at, record_count, complete_pair_count) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(runId, hash, submission.source, receivedAt, submission.records.length, completePairs),
      ...this.evidenceInserts(runId, submission.records, receivedAt),
      ...this.aggregateInserts(contributions, receivedAt),
    ]
    await this.commit(statements)
    return { runId, duplicate: false, crossedThresholds: thresholdsCrossed(before, before + completePairs) }
  }

  private async append(runId: string, source: PublicSubmission['source'], records: PublicEvidenceInput[], receivedAt: string): Promise<PublicPublishResult> {
    const run = await this.db.prepare('SELECT id FROM public_runs WHERE id = ?').bind(runId).first<{ id: string }>()
    if (!run) throw new Error('Cannot add results to an unknown public run.')
    const existing = await this.loadRunInputs(runId)
    const beforePairs = aggregateSubmission({ source, records: existing })
    const afterPairs = aggregateSubmission({ source, records: [...existing, ...records] })
    const before = await this.globalCompletePairs()
    const statements: D1Statement[] = [
      this.db.prepare('UPDATE public_runs SET record_count = record_count + ?, complete_pair_count = ? WHERE id = ?')
        .bind(records.length, totalCompletePairs(afterPairs), runId),
      ...this.evidenceInserts(runId, records, receivedAt),
      ...this.aggregateInserts(contributionDelta(beforePairs, afterPairs), receivedAt),
    ]
    await this.commit(statements)
    return { runId, duplicate: false, crossedThresholds: thresholdsCrossed(before, before + totalCompletePairs(afterPairs) - totalCompletePairs(beforePairs)) }
  }

  private async existingHashes(records: PublicEvidenceInput[]): Promise<Set<string>> {
    const hashes = records.map((record) => record.sha256.toLowerCase())
    if (hashes.length === 0) return new Set()
    const placeholders = hashes.map(() => '?').join(', ')
    const rows = (await this.db.prepare(`SELECT evidence_sha256 FROM public_evidence WHERE lower(evidence_sha256) IN (${placeholders})`)
      .bind(...hashes).all<{ evidence_sha256: string }>()).results ?? []
    return new Set(rows.map((row) => s(row.evidence_sha256).toLowerCase()))
  }

  private async loadRunInputs(runId: string): Promise<PublicEvidenceInput[]> {
    const rows = (await this.db.prepare(`SELECT pair_index, run_index, question, variant_key, variant_label, provider, model_id, prompt, response,
        latency_ms, status_code, status, error_message, truncated, evidence_sha256
      FROM public_evidence WHERE run_id = ?`).bind(runId).all()).results ?? []
    return rows.map((row) => ({
      pairIndex: n(row.pair_index), runIndex: n(row.run_index),
      question: row.question == null ? undefined : s(row.question),
      variantKey: s(row.variant_key) as 'A' | 'B', variantLabel: s(row.variant_label),
      provider: s(row.provider), modelId: s(row.model_id), prompt: s(row.prompt), response: s(row.response),
      latencyMs: n(row.latency_ms), statusCode: n(row.status_code), status: s(row.status) as 'ok' | 'error',
      errorMessage: row.error_message == null ? undefined : s(row.error_message),
      truncated: n(row.truncated) === 1 ? true : undefined,
      sha256: s(row.evidence_sha256),
    }))
  }

  private async globalCompletePairs(): Promise<number> {
    const row = await this.db.prepare('SELECT COALESCE(SUM(complete_pair_count), 0) AS total FROM model_aggregates').first<{ total: number }>()
    return n(row?.total)
  }

  private evidenceInserts(runId: string, records: PublicEvidenceInput[], receivedAt: string): D1Statement[] {
    return records.map((record) => this.db.prepare(`INSERT INTO public_evidence
      (id, run_id, pair_index, run_index, question, question_key, variant_key, variant_label, provider, model_id, prompt, response, latency_ms, status_code, status, error_message, truncated, evidence_sha256, classification, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), runId, record.pairIndex, record.runIndex, record.question ?? null,
        normalizeQuestionKey(record.question), record.variantKey, record.variantLabel, record.provider, record.modelId,
        record.prompt, record.response, record.latencyMs, record.statusCode, record.status, record.errorMessage ?? null,
        record.truncated ? 1 : 0, record.sha256, classifyPublicEvidence(record), receivedAt))
  }

  private aggregateInserts(contributions: ModelContribution[], receivedAt: string): D1Statement[] {
    return contributions.map((item) => this.db.prepare(`INSERT INTO model_aggregates
      (provider, model_id, response_count, complete_pair_count, asymmetric_pair_count, answered_count, refusal_count, error_count, truncated_count, latency_sum_ms, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, model_id) DO UPDATE SET
        response_count=response_count+excluded.response_count,
        complete_pair_count=complete_pair_count+excluded.complete_pair_count,
        asymmetric_pair_count=asymmetric_pair_count+excluded.asymmetric_pair_count,
        answered_count=answered_count+excluded.answered_count,
        refusal_count=refusal_count+excluded.refusal_count,
        error_count=error_count+excluded.error_count,
        truncated_count=truncated_count+excluded.truncated_count,
        latency_sum_ms=latency_sum_ms+excluded.latency_sum_ms,
        last_seen_at=excluded.last_seen_at`)
      .bind(item.provider, item.modelId, item.responseCount, item.completePairs, item.asymmetricPairs,
        item.answeredCount, item.refusalCount, item.errorCount, item.truncatedCount, item.latencySumMs, receivedAt, receivedAt))
  }

  private async commit(statements: D1Statement[]): Promise<void> {
    for (let index = 0; index < statements.length; index += 40) {
      await this.db.batch(statements.slice(index, index + 40))
    }
    invalidatePublicReadCache()
  }
}
