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

const JUDGE_MODEL = 'z-ai/glm-5.3-flash'
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

  async upsertPairScores(reportId: string, scores: GeneratedReportPairScore[], leaseOwner: string): Promise<void> {
    if (scores.length === 0) return
    const statements = scores.map((score) => this.db.prepare(`INSERT OR REPLACE INTO report_pair_scores
      (report_id, pair_sample_id, pair_index, run_index, provider, model_id, score_json)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM generated_reports WHERE id=? AND status='pending' AND generation_lease_owner=?
      )`)
      .bind(reportId, score.pairSampleId, score.pairIndex, score.runIndex, score.provider, score.modelId, JSON.stringify(score), reportId, leaseOwner))
    try {
      await this.db.batch(statements)
    } catch {
      await this.db.batch(scores.map((score) => this.db.prepare(`INSERT OR REPLACE INTO report_pair_scores
        (report_id, pair_index, run_index, provider, model_id, score_json)
        SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (
          SELECT 1 FROM generated_reports WHERE id=? AND status='pending' AND generation_lease_owner=?
        )`)
        .bind(reportId, score.pairIndex, score.runIndex, score.provider, score.modelId, JSON.stringify(score), reportId, leaseOwner)))
    }
  }

  async loadJudgeBatch(reportId: string): Promise<{ id: string; status: string } | null> {
    const row = await this.db.prepare('SELECT judge_batch_id, judge_batch_status FROM generated_reports WHERE id=?')
      .bind(reportId).first<{ judge_batch_id: string | null; judge_batch_status: string | null }>()
    return row?.judge_batch_id ? { id: s(row.judge_batch_id), status: s(row.judge_batch_status) } : null
  }

  async saveJudgeBatch(reportId: string, batch: { id: string; status: string }, leaseOwner: string): Promise<void> {
    await this.db.prepare(`UPDATE generated_reports SET judge_batch_id=?, judge_batch_status=?
      WHERE id=? AND status='pending' AND generation_lease_owner=? AND judge_batch_id IS NULL`)
      .bind(batch.id, batch.status, reportId, leaseOwner).run()
  }

  async updateJudgeBatchStatus(reportId: string, status: string, leaseOwner: string): Promise<void> {
    await this.db.prepare(`UPDATE generated_reports SET judge_batch_status=?
      WHERE id=? AND status='pending' AND generation_lease_owner=?`)
      .bind(status, reportId, leaseOwner).run()
  }

  async clearJudgeBatch(reportId: string, leaseOwner: string): Promise<void> {
    await this.db.prepare(`UPDATE generated_reports SET judge_batch_id=NULL, judge_batch_status=NULL
      WHERE id=? AND status='pending' AND generation_lease_owner=?`)
      .bind(reportId, leaseOwner).run()
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
      status, error_code, scoring_model_id, synthesis_model_id, title, structured_json, created_at, completed_at FROM generated_reports
      ORDER BY COALESCE(completed_at, created_at) DESC LIMIT 50`).all()).results ?? []
    const summaries: GeneratedReportSummary[] = []
    for (const row of rows.map(mapReportRow)) {
      if (row.status === 'complete') { summaries.push(this.summary(row)); continue }
      let progress: GeneratedReportSummary['progress']
      try {
        const [scores, source] = await Promise.all([this.loadPairScores(row.id), this.getReportEvidence(row.id)])
        progress = reportAnalysisProgress(source.evidence, scores)
      } catch {
        // No evidence to count: the row still lists, just without a progress figure.
      }
      summaries.push({ ...this.summary(row), ...(progress ? { progress } : {}), errorCode: row.errorCode })
    }
    return summaries
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
    await this.db.prepare(`UPDATE generated_reports
      SET status='pending', error_code=NULL, created_at=?, scoring_model_id=?, synthesis_model_id=?
      WHERE id=? AND status='failed' AND generation_lease_owner IS NULL`)
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
    const row = await this.db.prepare(`SELECT id, scope, public_run_id, response_watermark, cohort_fingerprint, cohort_snapshot_json, generation_lease_until, generation_lease_owner, judge_batch_id, judge_batch_status,
      status, error_code, scoring_model_id, synthesis_model_id, title, structured_json, created_at, completed_at FROM generated_reports WHERE scope='run' AND public_run_id=?`)
      .bind(runId).first<Record<string, unknown>>()
    return row ? mapReportRow(row) : null
  }

  private async findByCohortFingerprint(fingerprint: string): Promise<ReportRow | null> {
    const row = await this.db.prepare(`SELECT id, scope, public_run_id, response_watermark, cohort_fingerprint, cohort_snapshot_json, generation_lease_until, generation_lease_owner, judge_batch_id, judge_batch_status,
      status, error_code, scoring_model_id, synthesis_model_id, title, structured_json, created_at, completed_at FROM generated_reports WHERE scope='global' AND cohort_fingerprint=?`)
      .bind(fingerprint).first<Record<string, unknown>>()
    return row ? mapReportRow(row) : null
  }

  private async getRow(id: string): Promise<ReportRow | null> {
    const row = await this.db.prepare(`SELECT id, scope, public_run_id, response_watermark, cohort_fingerprint, cohort_snapshot_json, generation_lease_until, generation_lease_owner, judge_batch_id, judge_batch_status,
      status, error_code, scoring_model_id, synthesis_model_id, title, structured_json, created_at, completed_at FROM generated_reports WHERE id=?`)
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
