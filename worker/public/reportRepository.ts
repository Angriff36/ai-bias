import {
  generatedReportSummarySchema,
  type GeneratedReportDocument,
  type GeneratedReportModelSummary,
  type GeneratedReportPairScore,
  type GeneratedReportSummary,
  type PublicEvidenceItem,
} from '../../src/public/contracts'
import type { D1DatabaseLike } from './d1'
import {
  buildGlobalCohortSnapshot,
  buildQuestionCatalog,
  buildQuestionSetSnapshot,
  remapEvidenceToCohort,
  selectReportableQuestions,
  snapshotFromStoredJson,
  type GlobalReportCohortSnapshot,
} from './reportGlobalCohort'
import { parseStoredReportDocument } from './reportDocumentParse'
import { comparisonIdentity, groupCompleteMatchedSamples } from './matchedSampleIdentity'
import { filterEvidenceByQuestionKeys } from './questionLeaderboard'
import { invalidateCachedReports } from './readCache'
import { normalizeQuestionKey } from '../../src/public/questionKeys'

const JUDGE_MODEL = 'z-ai/glm-5.3-flash'
const SYNTHESIS_MODEL = 'x-ai/grok-4.6'
const SCORING_MODEL = JUDGE_MODEL
const DAILY_REPORT_JOB_LIMIT = 20

const n = (value: unknown) => Number(value ?? 0)
const s = (value: unknown) => String(value ?? '')

export function completeQuestionCount(evidence: PublicEvidenceItem[]): number {
  const completeQuestions = new Set<string>()
  for (const group of groupCompleteMatchedSamples(evidence)) {
    completeQuestions.add(comparisonIdentity(group[0]))
  }
  return completeQuestions.size
}

export function summarizeReportModels(evidence: PublicEvidenceItem[]): GeneratedReportModelSummary[] {
  const grouped = new Map<string, PublicEvidenceItem[]>()
  for (const item of evidence) {
    const key = `${item.provider}\u0000${item.modelId}`
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  }
  return [...grouped.entries()].map(([key, records]) => {
    const [provider, modelId] = key.split('\u0000')
    return {
      provider,
      modelId,
      responses: records.length,
      completePairs: countCompleteModelPairs(records),
      refusals: records.filter((item) => item.classification === 'hard-refusal' || item.classification === 'soft-refusal').length,
      errors: records.filter((item) => item.classification === 'error').length,
      truncated: records.filter((item) => item.truncated).length,
    }
  }).sort((a, b) => a.provider.localeCompare(b.provider) || a.modelId.localeCompare(b.modelId))
}

function countCompleteModelPairs(records: PublicEvidenceItem[]): number {
  return groupCompleteMatchedSamples(records).length
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

interface ReportRow {
  id: string
  scope: 'run' | 'global'
  publicRunId: string | null
  responseWatermark: number | null
  cohortFingerprint: string | null
  cohortSnapshotJson: string | null
  status: 'pending' | 'complete' | 'failed'
  scoringModelId: string
  synthesisModelId: string
  title: string | null
  structuredJson: string | null
  createdAt: string
  completedAt: string | null
}

export type RunReportClaim =
  | { kind: 'ineligible'; completeQuestions: number }
  | { kind: 'limited' }
  | { kind: 'claimed' | 'existing'; report: GeneratedReportSummary }

export type QuestionSetReportClaim =
  | { kind: 'ineligible'; reportableQuestions: number }
  | { kind: 'limited' }
  | { kind: 'claimed' | 'existing'; report: GeneratedReportSummary }

export type GlobalReportClaim =
  | { kind: 'ineligible'; reportableQuestions: number }
  | { kind: 'unchanged'; report: GeneratedReportSummary }
  | { kind: 'not-due'; reportableQuestions: number }
  | { kind: 'limited' }
  | { kind: 'claimed' | 'existing'; report: GeneratedReportSummary }

export class GeneratedReportRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async loadAllPublicEvidence(): Promise<PublicEvidenceItem[]> {
    const results = (await this.db.prepare(`SELECT id, run_id, pair_index, run_index, question, variant_key, variant_label, provider, model_id,
      prompt, response, latency_ms, status_code, status, error_message, truncated, evidence_sha256, classification, received_at
      FROM public_evidence ORDER BY received_at, id`).all()).results ?? []
    return results.map(mapEvidenceRow)
  }

  async claimCurrentGlobalReport(now: string): Promise<GlobalReportClaim> {
    const evidence = await this.loadAllPublicEvidence()
    const catalog = buildQuestionCatalog(evidence)
    const snapshot = await buildGlobalCohortSnapshot(evidence, now)
    if (!snapshot) {
      return { kind: 'ineligible', reportableQuestions: selectReportableQuestions(catalog).length }
    }
    const existing = await this.findByCohortFingerprint(snapshot.cohortFingerprint)
    if (existing && existing.status !== 'failed') {
      return { kind: 'unchanged', report: this.summary(existing) }
    }
    return this.claimGlobalCohortReport(snapshot, now, existing)
  }

  async claimGlobalCohortReport(
    snapshot: GlobalReportCohortSnapshot,
    now: string,
    existing: ReportRow | null = null,
  ): Promise<GlobalReportClaim> {
    const found = existing ?? await this.findByCohortFingerprint(snapshot.cohortFingerprint)
    if (found) return this.reclaimOrReturn(found, now)
    if (await this.dailyLimitReached(now)) return { kind: 'limited' }
    const id = crypto.randomUUID()
    const evidenceHash = await sha256(`report-schema:1\nglobal-cohort:${snapshot.cohortFingerprint}`)
    await this.db.prepare(`INSERT INTO generated_reports
      (id, scope, cohort_fingerprint, cohort_snapshot_json, evidence_hash, status, scoring_model_id, synthesis_model_id, report_schema_version, created_at)
      VALUES (?, 'global', ?, ?, ?, 'pending', ?, ?, 1, ?) ON CONFLICT DO NOTHING`)
      .bind(id, snapshot.cohortFingerprint, JSON.stringify(snapshot), evidenceHash, SCORING_MODEL, SYNTHESIS_MODEL, now).run()
    const report = await this.findByCohortFingerprint(snapshot.cohortFingerprint)
    if (!report) throw new Error('Could not claim global cohort report.')
    return { kind: report.id === id ? 'claimed' : 'existing', report: this.summary(report) }
  }

  /** A person picks the questions and starts the report. Same questions + same evidence = the same report. */
  async claimQuestionSetReport(questionKeys: string[], now: string): Promise<QuestionSetReportClaim> {
    const keys = [...new Set(questionKeys.map((key) => normalizeQuestionKey(key)))].sort()
    const evidence = filterEvidenceByQuestionKeys(await this.loadAllPublicEvidence(), keys)
    const snapshot = await buildQuestionSetSnapshot(evidence, now)
    if (!snapshot) return { kind: 'ineligible', reportableQuestions: 0 }
    const existing = await this.findByCohortFingerprint(snapshot.cohortFingerprint)
    if (existing) return this.reclaimOrReturn(existing, now)
    if (await this.dailyLimitReached(now)) return { kind: 'limited' }
    const id = crypto.randomUUID()
    const evidenceHash = await sha256(`report-schema:1
question-set:${snapshot.cohortFingerprint}`)
    await this.db.prepare(`INSERT INTO generated_reports
      (id, scope, cohort_fingerprint, cohort_snapshot_json, question_keys_json, evidence_hash, status, scoring_model_id, synthesis_model_id, report_schema_version, created_at)
      VALUES (?, 'global', ?, ?, ?, ?, 'pending', ?, ?, 1, ?) ON CONFLICT DO NOTHING`)
      .bind(id, snapshot.cohortFingerprint, JSON.stringify(snapshot), JSON.stringify(snapshot.questionKeys), evidenceHash, SCORING_MODEL, SYNTHESIS_MODEL, now).run()
    const report = await this.findByCohortFingerprint(snapshot.cohortFingerprint)
    if (!report) throw new Error('Could not claim question-set report.')
    if (report.id === id && await this.dailyLimitExceeded(now)) {
      // Concurrent starts can all pass the pre-check; the row that pushed the day over the cap backs out.
      await this.db.prepare('DELETE FROM generated_reports WHERE id=?').bind(id).run()
      return { kind: 'limited' }
    }
    return { kind: report.id === id ? 'claimed' : 'existing', report: this.summary(report) }
  }

  async claimRunReport(runId: string, now: string): Promise<RunReportClaim> {
    const existing = await this.findByRun(runId)
    if (existing) return this.reclaimOrReturn(existing, now)
    const count = await this.db.prepare(`SELECT COUNT(DISTINCT pair_index) AS count FROM (
      SELECT pair_index, run_index, provider, model_id FROM public_evidence WHERE run_id = ?
      GROUP BY pair_index, run_index, provider, model_id HAVING COUNT(DISTINCT variant_key) = 2
    )`).bind(runId).first<{ count: number }>()
    const completeQuestions = n(count?.count)
    if (completeQuestions < 20) return { kind: 'ineligible', completeQuestions }
    const run = await this.db.prepare('SELECT id FROM public_runs WHERE id = ?').bind(runId).first<{ id: string }>()
    if (!run) return { kind: 'ineligible', completeQuestions: 0 }
    if (await this.dailyLimitReached(now)) return { kind: 'limited' }
    const id = crypto.randomUUID()
    const evidenceHash = await sha256(`report-schema:1\nrun:${runId}`)
    await this.db.prepare(`INSERT INTO generated_reports
      (id, scope, public_run_id, evidence_hash, status, scoring_model_id, synthesis_model_id, report_schema_version, created_at)
      VALUES (?, 'run', ?, ?, 'pending', ?, ?, 1, ?) ON CONFLICT DO NOTHING`)
      .bind(id, runId, evidenceHash, SCORING_MODEL, SYNTHESIS_MODEL, now).run()
    const report = await this.findByRun(runId)
    if (!report) throw new Error('Could not claim run report.')
    return { kind: report.id === id ? 'claimed' : 'existing', report: this.summary(report) }
  }

  async getReportEvidence(reportId: string): Promise<{ row: ReportRow; evidence: PublicEvidenceItem[] }> {
    const row = await this.getRow(reportId)
    if (!row) throw new Error('REPORT_NOT_FOUND')
    if (row.scope === 'run') {
      const results = (await this.db.prepare(`SELECT id, run_id, pair_index, run_index, question, variant_key, variant_label, provider, model_id,
          prompt, response, latency_ms, status_code, status, error_message, truncated, evidence_sha256, classification, received_at
        FROM public_evidence WHERE run_id = ? ORDER BY pair_index, run_index, provider, model_id, variant_key`).bind(row.publicRunId).all()).results ?? []
      return { row, evidence: results.map(mapEvidenceRow) }
    }
    if (row.cohortSnapshotJson) {
      const snapshot = snapshotFromStoredJson(row.cohortSnapshotJson)
      return { row, evidence: remapEvidenceToCohort(await this.loadAllPublicEvidence(), snapshot) }
    }
    if (row.responseWatermark != null) {
      const results = (await this.db.prepare(`SELECT id, run_id, pair_index, run_index, question, variant_key, variant_label, provider, model_id,
          prompt, response, latency_ms, status_code, status, error_message, truncated, evidence_sha256, classification, received_at
        FROM public_evidence ORDER BY received_at, id LIMIT ?`).bind(row.responseWatermark).all()).results ?? []
      return { row, evidence: results.map(mapEvidenceRow) }
    }
    throw new Error('GLOBAL_REPORT_SCOPE_MISSING')
  }

  async completeReport(reportId: string, document: GeneratedReportDocument, now: string): Promise<void> {
    const scoreStatements = document.pairScores.map((score) => this.db.prepare(`INSERT OR REPLACE INTO report_pair_scores
      (report_id, pair_sample_id, pair_index, run_index, provider, model_id, score_json) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(reportId, score.pairSampleId, score.pairIndex, score.runIndex, score.provider, score.modelId, JSON.stringify(score)))
    const legacyScoreStatements = document.pairScores.map((score) => this.db.prepare(`INSERT OR REPLACE INTO report_pair_scores
      (report_id, pair_index, run_index, provider, model_id, score_json) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(reportId, score.pairIndex, score.runIndex, score.provider, score.modelId, JSON.stringify(score)))
    const update = this.db.prepare(`UPDATE generated_reports SET status='complete', title=?, structured_json=?, error_code=NULL, completed_at=? WHERE id=?`)
      .bind(document.narrative.title, JSON.stringify(document), now, reportId)
    try {
      await this.db.batch([...scoreStatements, update])
    } catch {
      await this.db.batch([...legacyScoreStatements, update])
    }
    invalidateCachedReports()
  }

  async failReport(reportId: string, code: string): Promise<void> {
    await this.db.prepare("UPDATE generated_reports SET status='failed', error_code=? WHERE id=?").bind(code.slice(0, 80), reportId).run()
    invalidateCachedReports()
  }

  async countPairScores(reportId: string): Promise<number> {
    const row = await this.db.prepare('SELECT COUNT(*) AS count FROM report_pair_scores WHERE report_id = ?')
      .bind(reportId).first<{ count: number }>()
    return n(row?.count)
  }

  async clearPairScores(reportId: string): Promise<void> {
    await this.db.prepare('DELETE FROM report_pair_scores WHERE report_id = ?').bind(reportId).run()
  }

  async loadPairScores(reportId: string): Promise<GeneratedReportPairScore[]> {
    const rows = (await this.db.prepare('SELECT score_json FROM report_pair_scores WHERE report_id = ?')
      .bind(reportId).all()).results ?? []
    return rows.map((row) => JSON.parse(s(String((row as { score_json: string }).score_json))) as GeneratedReportPairScore)
  }

  async upsertPairScores(reportId: string, scores: GeneratedReportPairScore[]): Promise<void> {
    if (scores.length === 0) return
    const statements = scores.map((score) => this.db.prepare(`INSERT OR REPLACE INTO report_pair_scores
      (report_id, pair_sample_id, pair_index, run_index, provider, model_id, score_json) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(reportId, score.pairSampleId, score.pairIndex, score.runIndex, score.provider, score.modelId, JSON.stringify(score)))
    try {
      await this.db.batch(statements)
    } catch {
      await this.db.batch(scores.map((score) => this.db.prepare(`INSERT OR REPLACE INTO report_pair_scores
        (report_id, pair_index, run_index, provider, model_id, score_json) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(reportId, score.pairIndex, score.runIndex, score.provider, score.modelId, JSON.stringify(score))))
    }
  }

  async prepareReportGeneration(reportId: string, now: string): Promise<{ report: GeneratedReportSummary; started: boolean } | null> {
    const row = await this.getRow(reportId)
    if (!row || row.status === 'complete') return null
    const partialCount = await this.countPairScores(reportId)
    if (row.status === 'pending') {
      const ageMs = Date.now() - Date.parse(row.createdAt)
      if (ageMs < 45_000) return { report: this.summary(row), started: false }
      if (partialCount > 0) {
        await this.touchReportGeneration(reportId, now)
        return { report: this.summary({ ...row, status: 'pending', createdAt: now }), started: true }
      }
      if (ageMs < 20 * 60_000) return { report: this.summary(row), started: false }
      await this.failReport(reportId, 'stale-pending')
      await this.clearPairScores(reportId)
    }
    if (row.status === 'failed') {
      const failedPartialCount = await this.countPairScores(reportId)
      if (failedPartialCount === 0) await this.clearPairScores(reportId)
    }
    await this.db.prepare("UPDATE generated_reports SET status='pending', error_code=NULL, created_at=?, scoring_model_id=?, synthesis_model_id=? WHERE id=?")
      .bind(now, SCORING_MODEL, SYNTHESIS_MODEL, reportId).run()
    return { report: this.summary({ ...row, status: 'pending', createdAt: now }), started: true }
  }

  async touchReportGeneration(reportId: string, now: string): Promise<void> {
    await this.db.prepare("UPDATE generated_reports SET status='pending', error_code=NULL, created_at=? WHERE id=?")
      .bind(now, reportId).run()
  }

  async listReports(): Promise<GeneratedReportSummary[]> {
    const rows = (await this.db.prepare(`SELECT id, scope, public_run_id, response_watermark, cohort_fingerprint, cohort_snapshot_json,
      status, scoring_model_id, synthesis_model_id, title, structured_json, created_at, completed_at FROM generated_reports
      ORDER BY COALESCE(completed_at, created_at) DESC LIMIT 50`).all()).results ?? []
    return rows.map(mapReportRow).map((row) => this.summary(row))
  }

  async getReportDocument(id: string): Promise<GeneratedReportDocument | null> {
    const row = await this.getRow(id)
    if (!row?.structuredJson || row.status !== 'complete') return null
    return parseStoredReportDocument(row.structuredJson)
  }

  private async reclaimOrReturn(row: ReportRow, now: string): Promise<{ kind: 'claimed' | 'existing'; report: GeneratedReportSummary }> {
    const finalized = await this.finalizeStoredDocumentIfValid(row, now)
    if (finalized) return { kind: 'existing', report: this.summary(finalized) }

    if (row.status === 'pending' && Date.now() - Date.parse(row.createdAt) > 5 * 60_000) {
      await this.db.prepare("UPDATE generated_reports SET status='failed', error_code='stale-pending' WHERE id=?").bind(row.id).run()
      row = { ...row, status: 'failed' }
    }
    if (row.status !== 'failed') return { kind: 'existing', report: this.summary(row) }
    await this.db.prepare("UPDATE generated_reports SET status='pending', error_code=NULL, created_at=?, scoring_model_id=?, synthesis_model_id=? WHERE id=?")
      .bind(now, SCORING_MODEL, SYNTHESIS_MODEL, row.id).run()
    return { kind: 'claimed', report: this.summary({ ...row, status: 'pending', createdAt: now }) }
  }

  private async finalizeStoredDocumentIfValid(row: ReportRow, now: string): Promise<ReportRow | null> {
    if (!row.structuredJson || row.status === 'complete') return row.status === 'complete' ? row : null
    const parsed = parseStoredReportDocument(row.structuredJson)
    if (!parsed) return null
    const completedAt = row.completedAt ?? parsed.generatedAt ?? now
    await this.db.prepare("UPDATE generated_reports SET status='complete', title=?, error_code=NULL, completed_at=? WHERE id=?")
      .bind(parsed.narrative.title, completedAt, row.id).run()
    return { ...row, status: 'complete', title: parsed.narrative.title, completedAt }
  }

  private async findByRun(runId: string): Promise<ReportRow | null> {
    const row = await this.db.prepare(`SELECT id, scope, public_run_id, response_watermark, cohort_fingerprint, cohort_snapshot_json,
      status, scoring_model_id, synthesis_model_id, title, structured_json, created_at, completed_at FROM generated_reports WHERE scope='run' AND public_run_id=?`)
      .bind(runId).first<Record<string, unknown>>()
    return row ? mapReportRow(row) : null
  }

  private async findByCohortFingerprint(fingerprint: string): Promise<ReportRow | null> {
    const row = await this.db.prepare(`SELECT id, scope, public_run_id, response_watermark, cohort_fingerprint, cohort_snapshot_json,
      status, scoring_model_id, synthesis_model_id, title, structured_json, created_at, completed_at FROM generated_reports WHERE scope='global' AND cohort_fingerprint=?`)
      .bind(fingerprint).first<Record<string, unknown>>()
    return row ? mapReportRow(row) : null
  }

  private async getRow(id: string): Promise<ReportRow | null> {
    const row = await this.db.prepare(`SELECT id, scope, public_run_id, response_watermark, cohort_fingerprint, cohort_snapshot_json,
      status, scoring_model_id, synthesis_model_id, title, structured_json, created_at, completed_at FROM generated_reports WHERE id=?`)
      .bind(id).first<Record<string, unknown>>()
    return row ? mapReportRow(row) : null
  }

  private summary(row: ReportRow): GeneratedReportSummary {
    const document = row.structuredJson ? parseStoredReportDocument(row.structuredJson) : null
    return generatedReportSummarySchema.parse({
      id: row.id, scope: row.scope, status: row.status, title: row.title,
      responseCount: document?.responseCount ?? 0, completePairs: document?.completePairs ?? 0,
      modelCount: document?.modelCount ?? 0, createdAt: row.createdAt, completedAt: row.completedAt,
    })
  }

  private async dailyLimitReached(now: string): Promise<boolean> {
    const start = `${now.slice(0, 10)}T00:00:00.000Z`
    const row = await this.db.prepare('SELECT COUNT(*) AS count FROM generated_reports WHERE created_at >= ?')
      .bind(start).first<{ count: number }>()
    return n(row?.count) >= DAILY_REPORT_JOB_LIMIT
  }
}

function mapReportRow(row: Record<string, unknown>): ReportRow {
  return {
    id: s(row.id), scope: s(row.scope) as ReportRow['scope'], publicRunId: row.public_run_id == null ? null : s(row.public_run_id),
    responseWatermark: row.response_watermark == null ? null : n(row.response_watermark),
    cohortFingerprint: row.cohort_fingerprint == null ? null : s(row.cohort_fingerprint),
    cohortSnapshotJson: row.cohort_snapshot_json == null ? null : s(row.cohort_snapshot_json),
    status: s(row.status) as ReportRow['status'], scoringModelId: s(row.scoring_model_id), synthesisModelId: s(row.synthesis_model_id),
    title: row.title == null ? null : s(row.title), structuredJson: row.structured_json == null ? null : s(row.structured_json),
    createdAt: s(row.created_at), completedAt: row.completed_at == null ? null : s(row.completed_at),
  }
}

function mapEvidenceRow(row: Record<string, unknown>): PublicEvidenceItem {
  return {
    id: s(row.id), runId: s(row.run_id), pairIndex: n(row.pair_index), runIndex: n(row.run_index),
    question: row.question == null ? undefined : s(row.question), variantKey: s(row.variant_key) as 'A' | 'B',
    variantLabel: s(row.variant_label), provider: s(row.provider), modelId: s(row.model_id), prompt: s(row.prompt),
    response: s(row.response), latencyMs: n(row.latency_ms), statusCode: n(row.status_code), status: s(row.status) as 'ok' | 'error',
    errorMessage: row.error_message == null ? undefined : s(row.error_message), truncated: n(row.truncated) === 1,
    sha256: s(row.evidence_sha256), classification: s(row.classification) as PublicEvidenceItem['classification'], receivedAt: s(row.received_at),
  }
}
