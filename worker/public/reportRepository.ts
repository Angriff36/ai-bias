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
import { buildPairSampleId, comparisonIdentity, groupCompleteMatchedSamples } from './matchedSampleIdentity'
import { filterEvidenceByQuestionKeys } from './questionLeaderboard'
import { invalidateCachedReports, writeCachedClaims } from './readCache'
import { normalizeQuestionKey } from '../../src/public/questionKeys'
import { groupPolarJudgeCells } from './reportJudgeBatch'
import { REPORT_JUDGE_MODEL } from './reportJudgeClient'

const JUDGE_MODEL = REPORT_JUDGE_MODEL
const SYNTHESIS_MODEL = 'x-ai/grok-4.6'
const SCORING_MODEL = JUDGE_MODEL
const DAILY_REPORT_JOB_LIMIT = 20
const REPORT_GENERATION_LEASE_MS = 130_000
/**
 * Every report insert is one atomic statement guarded by today's count, so
 * concurrent starts on any path cannot exceed the cap and no over-cap row is
 * ever visible. Bind: day start, then the cap.
 */
const UNDER_DAILY_CAP = '(SELECT COUNT(*) FROM generated_reports WHERE created_at >= ?) < ?'
const dayStart = (now: string) => `${now.slice(0, 10)}T00:00:00.000Z`

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

export function reportAnalysisProgress(
  evidence: PublicEvidenceItem[],
  scores: GeneratedReportPairScore[],
): { completedAnalyses: number; expectedAnalyses: number } {
  const cells = groupPolarJudgeCells(evidence)
  const scoredIds = new Set(scores.map((score) => score.pairSampleId))
  const completedAnalyses = cells.filter((cell) => cell.groups.every((group) => {
    const variantA = group.find((item) => item.variantKey === 'A')!
    return scoredIds.has(buildPairSampleId(variantA))
  })).length
  return { completedAnalyses, expectedAnalyses: cells.length }
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
  generationLeaseUntil: string | null
  generationLeaseOwner: string | null
  judgeBatchId: string | null
  judgeBatchStatus: string | null
  analysisCompleted: number
  analysisTotal: number
  status: 'pending' | 'complete' | 'failed'
  errorCode?: string | null
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
    const id = crypto.randomUUID()
    const evidenceHash = await sha256(`report-schema:1\nglobal-cohort:${snapshot.cohortFingerprint}`)
    await this.db.prepare(`INSERT INTO generated_reports
      (id, scope, cohort_fingerprint, cohort_snapshot_json, evidence_hash, status, scoring_model_id, synthesis_model_id, report_schema_version, created_at)
      SELECT ?, 'global', ?, ?, ?, 'pending', ?, ?, 1, ?
      WHERE ${UNDER_DAILY_CAP}
      ON CONFLICT DO NOTHING`)
      .bind(id, snapshot.cohortFingerprint, JSON.stringify(snapshot), evidenceHash, SCORING_MODEL, SYNTHESIS_MODEL, now, dayStart(now), DAILY_REPORT_JOB_LIMIT).run()
    const report = await this.findByCohortFingerprint(snapshot.cohortFingerprint)
    if (!report) return { kind: 'limited' }
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
    const id = crypto.randomUUID()
    const evidenceHash = await sha256(`report-schema:1\nquestion-set:${snapshot.cohortFingerprint}`)
    await this.db.prepare(`INSERT INTO generated_reports
      (id, scope, cohort_fingerprint, cohort_snapshot_json, question_keys_json, evidence_hash, status, scoring_model_id, synthesis_model_id, report_schema_version, created_at)
      SELECT ?, 'global', ?, ?, ?, ?, 'pending', ?, ?, 1, ?
      WHERE ${UNDER_DAILY_CAP}
      ON CONFLICT DO NOTHING`)
      .bind(id, snapshot.cohortFingerprint, JSON.stringify(snapshot), JSON.stringify(snapshot.questionKeys), evidenceHash, SCORING_MODEL, SYNTHESIS_MODEL, now, dayStart(now), DAILY_REPORT_JOB_LIMIT).run()
    const report = await this.findByCohortFingerprint(snapshot.cohortFingerprint)
    if (!report) return { kind: 'limited' }
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
    const id = crypto.randomUUID()
    const evidenceHash = await sha256(`report-schema:1\nrun:${runId}`)
    await this.db.prepare(`INSERT INTO generated_reports
      (id, scope, public_run_id, evidence_hash, status, scoring_model_id, synthesis_model_id, report_schema_version, created_at)
      SELECT ?, 'run', ?, ?, 'pending', ?, ?, 1, ?
      WHERE ${UNDER_DAILY_CAP}
      ON CONFLICT DO NOTHING`)
      .bind(id, runId, evidenceHash, SCORING_MODEL, SYNTHESIS_MODEL, now, dayStart(now), DAILY_REPORT_JOB_LIMIT).run()
    const report = await this.findByRun(runId)
    if (!report) return { kind: 'limited' }
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

  async completeReport(reportId: string, document: GeneratedReportDocument, now: string, leaseOwner: string): Promise<void> {
    await this.db.prepare(`UPDATE generated_reports
      SET status='complete', title=?, structured_json=?, error_code=NULL,
          generation_lease_until=NULL, generation_lease_owner=NULL, completed_at=?
      WHERE id=? AND status='pending' AND generation_lease_owner=?`)
      .bind(document.narrative.title, JSON.stringify(document), now, reportId, leaseOwner).run()
    invalidateCachedReports()
    writeCachedClaims(null)
  }

  async failReport(reportId: string, code: string, leaseOwner: string): Promise<void> {
    await this.db.prepare(`UPDATE generated_reports
      SET status='failed', error_code=?, generation_lease_until=NULL, generation_lease_owner=NULL
      WHERE id=? AND status='pending' AND generation_lease_owner=?`)
      .bind(code.slice(0, 80), reportId, leaseOwner).run()
    invalidateCachedReports()
  }

  async loadPairScores(reportId: string): Promise<GeneratedReportPairScore[]> {
    const rows = (await this.db.prepare('SELECT score_json FROM report_pair_scores WHERE report_id = ?')
      .bind(reportId).all()).results ?? []
    return rows.map((row) => JSON.parse(s(String((row as { score_json: string }).score_json))) as GeneratedReportPairScore)
  }

  async registerQueuedAnalyses(reportId: string, analysisIds: string[], leaseOwner: string): Promise<string[]> {
    if (analysisIds.length === 0) return []
    await this.db.batch(analysisIds.map((analysisId) => this.db.prepare(`INSERT OR IGNORE INTO report_analysis_checkpoints
      (report_id, analysis_id, status)
      SELECT ?, ?, 'pending' WHERE EXISTS (
        SELECT 1 FROM generated_reports WHERE id=? AND status='pending' AND generation_lease_owner=?
      )`).bind(reportId, analysisId, reportId, leaseOwner)))
    await this.db.prepare(`UPDATE generated_reports SET
      analysis_completed=(SELECT COUNT(*) FROM report_analysis_checkpoints WHERE report_id=? AND status='complete'),
      analysis_total=(SELECT COUNT(*) FROM report_analysis_checkpoints WHERE report_id=?),
      judge_batch_id=NULL, judge_batch_status=NULL
      WHERE id=? AND status='pending' AND generation_lease_owner=?`)
      .bind(reportId, reportId, reportId, leaseOwner).run()
    const rows = (await this.db.prepare(`SELECT analysis_id FROM report_analysis_checkpoints
      WHERE report_id=? AND status='pending' AND enqueued_at IS NULL`).bind(reportId).all<{ analysis_id: string }>()).results ?? []
    return rows.map((row) => s(row.analysis_id))
  }

  async markQueuedAnalysesEnqueued(reportId: string, analysisIds: string[], now: string, leaseOwner: string): Promise<void> {
    if (analysisIds.length === 0) return
    await this.db.batch(analysisIds.map((analysisId) => this.db.prepare(`UPDATE report_analysis_checkpoints
      SET enqueued_at=? WHERE report_id=? AND analysis_id=? AND status='pending' AND EXISTS (
        SELECT 1 FROM generated_reports WHERE id=? AND status='pending' AND generation_lease_owner=?
      )`).bind(now, reportId, analysisId, reportId, leaseOwner)))
  }

  async claimQueuedAnalysis(
    reportId: string,
    analysisId: string,
    now: string,
    retry: boolean,
  ): Promise<'claimed' | 'complete' | 'unavailable'> {
    const claimed = await this.db.prepare(`UPDATE report_analysis_checkpoints SET completed_at=?
      WHERE report_id=? AND analysis_id=? AND status='pending' AND (completed_at IS NULL OR ?=1)`)
      .bind(now, reportId, analysisId, retry ? 1 : 0).run()
    if ((claimed.meta?.changes ?? 0) > 0) return 'claimed'
    const row = await this.db.prepare(`SELECT status FROM report_analysis_checkpoints
      WHERE report_id=? AND analysis_id=?`).bind(reportId, analysisId).first<{ status: string }>()
    return row?.status === 'complete' ? 'complete' : 'unavailable'
  }

  async releaseQueuedAnalysisClaim(reportId: string, analysisId: string): Promise<void> {
    await this.db.prepare(`UPDATE report_analysis_checkpoints SET completed_at=NULL
      WHERE report_id=? AND analysis_id=? AND status='pending'`).bind(reportId, analysisId).run()
  }

  async completeQueuedAnalysis(
    reportId: string,
    analysisId: string,
    scores: GeneratedReportPairScore[],
    now: string,
  ): Promise<{ allComplete: boolean }> {
    const scoreStatements = scores.map((score) => this.db.prepare(`INSERT OR REPLACE INTO report_pair_scores
      (report_id, pair_sample_id, pair_index, run_index, provider, model_id, score_json)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM report_analysis_checkpoints WHERE report_id=? AND analysis_id=? AND status='pending'
      )`).bind(reportId, score.pairSampleId, score.pairIndex, score.runIndex, score.provider, score.modelId,
        JSON.stringify(score), reportId, analysisId))
    await this.db.batch([
      ...scoreStatements,
      this.db.prepare(`UPDATE report_analysis_checkpoints SET status='complete', completed_at=?, error_code=NULL
        WHERE report_id=? AND analysis_id=? AND status='pending'`).bind(now, reportId, analysisId),
      this.db.prepare(`UPDATE generated_reports SET
        analysis_completed=(SELECT COUNT(*) FROM report_analysis_checkpoints WHERE report_id=? AND status='complete'),
        analysis_total=(SELECT COUNT(*) FROM report_analysis_checkpoints WHERE report_id=?),
        generation_lease_until=NULL, generation_lease_owner=NULL
        WHERE id=? AND status='pending'`).bind(reportId, reportId, reportId),
    ])
    invalidateCachedReports()
    const progress = await this.db.prepare(`SELECT analysis_completed, analysis_total FROM generated_reports WHERE id=? AND status='pending'`)
      .bind(reportId).first<{ analysis_completed: number; analysis_total: number }>()
    return { allComplete: n(progress?.analysis_total) > 0 && n(progress?.analysis_completed) >= n(progress?.analysis_total) }
  }

  async failQueuedAnalysis(reportId: string, analysisId: string, code: string, now: string): Promise<void> {
    await this.db.batch([
      this.db.prepare(`UPDATE report_analysis_checkpoints SET status='failed', completed_at=?, error_code=?
        WHERE report_id=? AND analysis_id=? AND status='pending'`).bind(now, code.slice(0, 80), reportId, analysisId),
      this.db.prepare(`UPDATE generated_reports SET status='failed', error_code=?, generation_lease_until=NULL, generation_lease_owner=NULL
        WHERE id=? AND status='pending'`).bind(code.slice(0, 80), reportId),
    ])
    invalidateCachedReports()
  }

  async claimReportFinalization(reportId: string, now: string): Promise<string | null> {
    const leaseOwner = crypto.randomUUID()
    const leaseUntil = new Date(Date.parse(now) + REPORT_GENERATION_LEASE_MS).toISOString()
    const result = await this.db.prepare(`UPDATE generated_reports SET generation_lease_until=?, generation_lease_owner=?
      WHERE id=? AND status='pending' AND analysis_total>0 AND analysis_completed>=analysis_total
        AND (generation_lease_owner IS NULL OR generation_lease_until IS NULL OR generation_lease_until<=?)`)
      .bind(leaseUntil, leaseOwner, reportId, now).run()
    return (result.meta?.changes ?? 0) > 0 ? leaseOwner : null
  }

  async prepareReportGeneration(reportId: string, now: string): Promise<{ report: GeneratedReportSummary; started: boolean; leaseOwner?: string } | null> {
    const row = await this.getRow(reportId)
    if (!row || row.status === 'complete') return null
    if (row.generationLeaseOwner && row.generationLeaseUntil && Date.parse(row.generationLeaseUntil) > Date.parse(now)) {
      return { report: this.summary(row), started: false }
    }
    const leaseUntil = new Date(Date.parse(now) + REPORT_GENERATION_LEASE_MS).toISOString()
    const leaseOwner = crypto.randomUUID()
    const claim = await this.db.prepare(`UPDATE generated_reports
      SET status='pending', error_code=NULL, generation_lease_until=?, generation_lease_owner=?,
          scoring_model_id=?, synthesis_model_id=?
      WHERE id=? AND status IN ('pending','failed')
        AND (generation_lease_owner IS NULL OR generation_lease_until IS NULL OR generation_lease_until<=?)`)
      .bind(leaseUntil, leaseOwner, SCORING_MODEL, SYNTHESIS_MODEL, reportId, now).run()
    if ((claim.meta?.changes ?? 0) === 0) {
      const current = await this.getRow(reportId)
      return current ? { report: this.summary(current), started: false } : null
    }
    if (row.status === 'failed') {
      await this.resetRetryableAnalysisCheckpoints(reportId)
    }
    return {
      report: this.summary({ ...row, status: 'pending', generationLeaseUntil: leaseUntil, generationLeaseOwner: leaseOwner }),
      started: true,
      leaseOwner,
    }
  }

  async touchReportGeneration(reportId: string, now: string, leaseOwner: string): Promise<void> {
    const leaseUntil = new Date(Date.parse(now) + REPORT_GENERATION_LEASE_MS).toISOString()
    await this.db.prepare(`UPDATE generated_reports SET generation_lease_until=?
      WHERE id=? AND status='pending' AND generation_lease_owner=?`)
      .bind(leaseUntil, reportId, leaseOwner).run()
  }

  async releaseReportGeneration(reportId: string, leaseOwner: string): Promise<void> {
    await this.db.prepare(`UPDATE generated_reports SET generation_lease_until=NULL, generation_lease_owner=NULL
      WHERE id=? AND status='pending' AND generation_lease_owner=?`).bind(reportId, leaseOwner).run()
  }

  async listReports(): Promise<GeneratedReportSummary[]> {
    const rows = (await this.db.prepare(`SELECT id, scope, public_run_id, response_watermark, cohort_fingerprint, cohort_snapshot_json, generation_lease_until, generation_lease_owner, judge_batch_id, judge_batch_status,
      analysis_completed, analysis_total, status, error_code, scoring_model_id, synthesis_model_id, title, structured_json, created_at, completed_at FROM generated_reports
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

    const leaseActive = row.generationLeaseOwner && row.generationLeaseUntil
      && Date.parse(row.generationLeaseUntil) > Date.parse(now)
    if (row.status === 'pending' && leaseActive) return { kind: 'existing', report: this.summary(row) }
    if (row.status === 'pending' && Date.parse(now) - Date.parse(row.createdAt) > 5 * 60_000) {
      const stale = await this.db.prepare(`UPDATE generated_reports
        SET status='failed', error_code='stale-pending', generation_lease_until=NULL, generation_lease_owner=NULL
        WHERE id=? AND status='pending'
          AND (generation_lease_owner IS NULL OR generation_lease_until IS NULL OR generation_lease_until<=?)`)
        .bind(row.id, now).run()
      if ((stale.meta?.changes ?? 0) === 0) {
        const current = await this.getRow(row.id)
        return { kind: 'existing', report: this.summary(current ?? row) }
      }
      row = { ...row, status: 'failed', generationLeaseUntil: null, generationLeaseOwner: null }
    }
    if (row.status !== 'failed') return { kind: 'existing', report: this.summary(row) }
    const reclaimed = await this.db.prepare(`UPDATE generated_reports
      SET status='pending', error_code=NULL, created_at=?, scoring_model_id=?, synthesis_model_id=?
      WHERE id=? AND status='failed' AND generation_lease_owner IS NULL`)
      .bind(now, SCORING_MODEL, SYNTHESIS_MODEL, row.id).run()
    if ((reclaimed.meta?.changes ?? 0) === 0) {
      const current = await this.getRow(row.id)
      return { kind: 'existing', report: this.summary(current ?? row) }
    }
    await this.resetRetryableAnalysisCheckpoints(row.id)
    return { kind: 'claimed', report: this.summary({ ...row, status: 'pending', createdAt: now }) }
  }

  private async resetRetryableAnalysisCheckpoints(reportId: string): Promise<void> {
    await this.db.prepare(`UPDATE report_analysis_checkpoints
      SET status='pending', enqueued_at=NULL, completed_at=NULL, error_code=NULL
      WHERE report_id=? AND (status='failed' OR (status='pending' AND completed_at IS NULL))`)
      .bind(reportId).run()
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
    const row = await this.db.prepare(`SELECT id, scope, public_run_id, response_watermark, cohort_fingerprint, cohort_snapshot_json, generation_lease_until, generation_lease_owner, judge_batch_id, judge_batch_status,
      analysis_completed, analysis_total, status, error_code, scoring_model_id, synthesis_model_id, title, structured_json, created_at, completed_at FROM generated_reports WHERE scope='run' AND public_run_id=?`)
      .bind(runId).first<Record<string, unknown>>()
    return row ? mapReportRow(row) : null
  }

  private async findByCohortFingerprint(fingerprint: string): Promise<ReportRow | null> {
    const row = await this.db.prepare(`SELECT id, scope, public_run_id, response_watermark, cohort_fingerprint, cohort_snapshot_json, generation_lease_until, generation_lease_owner, judge_batch_id, judge_batch_status,
      analysis_completed, analysis_total, status, error_code, scoring_model_id, synthesis_model_id, title, structured_json, created_at, completed_at FROM generated_reports WHERE scope='global' AND cohort_fingerprint=?`)
      .bind(fingerprint).first<Record<string, unknown>>()
    return row ? mapReportRow(row) : null
  }

  private async getRow(id: string): Promise<ReportRow | null> {
    const row = await this.db.prepare(`SELECT id, scope, public_run_id, response_watermark, cohort_fingerprint, cohort_snapshot_json, generation_lease_until, generation_lease_owner, judge_batch_id, judge_batch_status,
      analysis_completed, analysis_total, status, error_code, scoring_model_id, synthesis_model_id, title, structured_json, created_at, completed_at FROM generated_reports WHERE id=?`)
      .bind(id).first<Record<string, unknown>>()
    return row ? mapReportRow(row) : null
  }

  private summary(row: ReportRow): GeneratedReportSummary {
    const document = row.structuredJson ? parseStoredReportDocument(row.structuredJson) : null
    return generatedReportSummarySchema.parse({
      id: row.id, scope: row.scope, status: row.status, title: row.title,
      responseCount: document?.responseCount ?? 0, completePairs: document?.completePairs ?? 0,
      modelCount: document?.modelCount ?? 0, createdAt: row.createdAt, completedAt: row.completedAt,
      ...(row.status !== 'complete' && row.analysisTotal > 0 ? {
        progress: { completedAnalyses: row.analysisCompleted, expectedAnalyses: row.analysisTotal },
      } : {}),
      errorCode: row.errorCode ?? null,
    })
  }
}

function mapReportRow(row: Record<string, unknown>): ReportRow {
  return {
    id: s(row.id), scope: s(row.scope) as ReportRow['scope'], errorCode: row.error_code == null ? null : s(row.error_code), publicRunId: row.public_run_id == null ? null : s(row.public_run_id),
    responseWatermark: row.response_watermark == null ? null : n(row.response_watermark),
    cohortFingerprint: row.cohort_fingerprint == null ? null : s(row.cohort_fingerprint),
    cohortSnapshotJson: row.cohort_snapshot_json == null ? null : s(row.cohort_snapshot_json),
    generationLeaseUntil: row.generation_lease_until == null ? null : s(row.generation_lease_until),
    generationLeaseOwner: row.generation_lease_owner == null ? null : s(row.generation_lease_owner),
    judgeBatchId: row.judge_batch_id == null ? null : s(row.judge_batch_id),
    judgeBatchStatus: row.judge_batch_status == null ? null : s(row.judge_batch_status),
    analysisCompleted: n(row.analysis_completed), analysisTotal: n(row.analysis_total),
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
