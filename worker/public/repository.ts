import type { PublicEvidenceItem, PublicLeaderboard, PublicModelAggregate, PublicQuestionDetail, PublicSubmission, GeneratedReportSummary } from '../../src/public/contracts'
import { generatedReportSummarySchema } from '../../src/public/contracts'
import type { D1DatabaseLike } from './d1'
import { PublicRunPublisher } from './publicRunPublisher'
import { buildQuestionDetail, buildTopQuestionSummaries } from './questionLeaderboard'
import { ensureQuestionKeys } from './questionKeyMaintenance'
import { buildQuestionCatalog } from './reportGlobalCohort'
import { readCachedLeaderboard, readCachedQuestionDetail, writeCachedLeaderboard, writeCachedQuestionDetail } from './readCache'

export { aggregateSubmission, type ModelContribution } from './publicSubmissionStats'

export interface FreeReservation { quotaHash: string; day: string }

const n = (value: unknown) => Number(value ?? 0)
const s = (value: unknown) => String(value ?? '')

function mapCatalogEvidenceRow(row: Record<string, unknown>): PublicEvidenceItem {
  return {
    id: s(row.id), runId: s(row.run_id), pairIndex: n(row.pair_index), runIndex: n(row.run_index),
    question: row.question == null ? undefined : s(row.question), variantKey: s(row.variant_key) as 'A' | 'B',
    variantLabel: s(row.variant_key), provider: s(row.provider), modelId: s(row.model_id),
    prompt: s(row.prompt), response: '', latencyMs: 0, statusCode: 0, status: s(row.status) as 'ok' | 'error',
    sha256: '', classification: 'answered', receivedAt: s(row.received_at),
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

const evidenceSelect = `SELECT id, run_id, pair_index, run_index, question, variant_key, variant_label,
  provider, model_id, prompt, response, latency_ms, status_code, status, error_message, truncated, evidence_sha256, classification, received_at
  FROM public_evidence`

const catalogEvidenceSelect = `SELECT id, run_id, pair_index, run_index, question, variant_key, provider, model_id, prompt, status, received_at
  FROM public_evidence`

export class PublicRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async publish(raw: PublicSubmission, receivedAt: string) {
    return new PublicRunPublisher(this.db).publish(raw, receivedAt)
  }

  async getLeaderboard(modelLimit = 50, recentLimit = 200, questionLimit = 100): Promise<PublicLeaderboard> {
    const cached = readCachedLeaderboard()
    if (cached) return cached
    await ensureQuestionKeys(this.db)
    const totals = await this.db.prepare(`SELECT
      (SELECT COUNT(*) FROM public_runs) AS runs,
      (SELECT COUNT(*) FROM public_evidence) AS responses,
      (SELECT COALESCE(SUM(complete_pair_count), 0) FROM model_aggregates) AS complete_pairs,
      (SELECT COUNT(*) FROM model_aggregates WHERE complete_pair_count > 0) AS models`).first<Record<string, unknown>>()
    const modelRows = (await this.db.prepare(`SELECT provider, model_id, response_count, complete_pair_count, asymmetric_pair_count,
      answered_count, refusal_count, error_count, truncated_count, latency_sum_ms, first_seen_at, last_seen_at
      FROM model_aggregates WHERE complete_pair_count > 0
      ORDER BY complete_pair_count DESC, (1.0 * asymmetric_pair_count / complete_pair_count) DESC, model_id ASC LIMIT ?`).bind(modelLimit).all()).results ?? []
    const evidenceRows = (await this.db.prepare(`${evidenceSelect} ORDER BY received_at DESC, run_id DESC, pair_index ASC, variant_key ASC LIMIT ?`).bind(recentLimit).all()).results ?? []
    const catalogRows = (await this.db.prepare(catalogEvidenceSelect).all()).results ?? []
    const catalogEvidence = catalogRows.map(mapCatalogEvidenceRow)
    const topQuestions = buildTopQuestionSummaries(catalogEvidence, questionLimit)
    const questionCount = buildQuestionCatalog(catalogEvidence).filter((entry) => entry.completePairCount > 0).length
    const analysis = await this.db.prepare(`SELECT threshold, model_id, analysis, completed_at FROM analysis_snapshots
      WHERE status='complete' ORDER BY threshold DESC LIMIT 1`).first<Record<string, unknown>>()
    const pending = await this.db.prepare("SELECT COUNT(*) AS count FROM analysis_snapshots WHERE status='pending'").first<{ count: number }>()
    const latestReportRow = await this.db.prepare(`SELECT id, scope, status, title, structured_json, created_at, completed_at
      FROM generated_reports WHERE status='complete' ORDER BY COALESCE(completed_at, created_at) DESC LIMIT 1`).first<Record<string, unknown>>()
    const pendingReports = await this.db.prepare("SELECT COUNT(*) AS count FROM generated_reports WHERE status='pending'").first<{ count: number }>()
    const models: PublicModelAggregate[] = modelRows.map((row) => {
      const responses = n(row.response_count)
      const pairs = n(row.complete_pair_count)
      return {
        provider: s(row.provider), modelId: s(row.model_id), responseCount: responses, completePairs: pairs,
        asymmetricPairs: n(row.asymmetric_pair_count), asymmetryRate: pairs ? n(row.asymmetric_pair_count) / pairs : null,
        answeredCount: n(row.answered_count), refusalCount: n(row.refusal_count), errorCount: n(row.error_count),
        truncatedCount: n(row.truncated_count), averageLatencyMs: responses ? n(row.latency_sum_ms) / responses : null,
        firstSeenAt: s(row.first_seen_at), lastSeenAt: s(row.last_seen_at),
      }
    })
    const recentEvidence: PublicEvidenceItem[] = evidenceRows.map(mapEvidenceRow)
    const leaderboard = {
      totals: {
        runs: n(totals?.runs),
        responses: n(totals?.responses),
        completePairs: n(totals?.complete_pairs),
        models: n(totals?.models),
        questions: questionCount,
      },
      topQuestions,
      models,
      latestAnalysis: analysis ? { threshold: n(analysis.threshold), modelId: s(analysis.model_id), analysis: s(analysis.analysis), completedAt: s(analysis.completed_at) } : null,
      analysisPending: n(pending?.count) > 0,
      latestReport: latestReportRow ? parseReportSummary(latestReportRow) : null,
      reportPending: n(pendingReports?.count) > 0,
      recentEvidence,
    }
    writeCachedLeaderboard(leaderboard)
    return leaderboard
  }

  async getQuestionDetail(questionKey: string): Promise<PublicQuestionDetail | null> {
    const cached = readCachedQuestionDetail(questionKey)
    if (cached) return cached
    await ensureQuestionKeys(this.db)
    const legacyPromptKey = /^prompt\s+\d+\s+vs\s+prompt\s+\d+$/i.test(questionKey)
    const statement = legacyPromptKey
      ? this.db.prepare(`${evidenceSelect} ORDER BY received_at DESC, run_id DESC, pair_index ASC, variant_key ASC`)
      : this.db.prepare(`${evidenceSelect} WHERE question_key = ? ORDER BY received_at DESC, run_id DESC, pair_index ASC, variant_key ASC`).bind(questionKey)
    const rows = (await statement.all()).results ?? []
    let detail = buildQuestionDetail(questionKey, rows.map(mapEvidenceRow))
    if (!detail && !legacyPromptKey && rows.length === 0) {
      // The leaderboard publishes keys derived from canonicalized/merged question
      // text, which no stored question_key column value may contain. Match those
      // keys against the full evidence like the leaderboard ranking does.
      const allRows = (await this.db.prepare(`${evidenceSelect} ORDER BY received_at DESC, run_id DESC, pair_index ASC, variant_key ASC`).all()).results ?? []
      detail = buildQuestionDetail(questionKey, allRows.map(mapEvidenceRow))
    }
    if (detail) writeCachedQuestionDetail(questionKey, detail)
    return detail
  }

  async getAllowance(quotaHash: string, day: string): Promise<{ remaining: number; dailyRemaining: number }> {
    const user = await this.db.prepare('SELECT used_count FROM free_allowances WHERE quota_hash=?').bind(quotaHash).first<{ used_count: number }>()
    const daily = await this.db.prepare('SELECT used_count FROM free_daily_budget WHERE utc_day=?').bind(day).first<{ used_count: number }>()
    return { remaining: Math.max(0, 2 - n(user?.used_count)), dailyRemaining: Math.max(0, 250 - n(daily?.used_count)) }
  }

  async reserveFreeQuestion(quotaHash: string, day: string, now: string): Promise<FreeReservation | null> {
    await this.db.batch([
      this.db.prepare('INSERT INTO free_allowances (quota_hash, used_count, created_at, updated_at) VALUES (?, 0, ?, ?) ON CONFLICT(quota_hash) DO NOTHING').bind(quotaHash, now, now),
      this.db.prepare('INSERT INTO free_daily_budget (utc_day, used_count, updated_at) VALUES (?, 0, ?) ON CONFLICT(utc_day) DO NOTHING').bind(day, now),
    ])
    const [userResult, dailyResult] = await this.db.batch([
      this.db.prepare('UPDATE free_allowances SET used_count=used_count+1, updated_at=? WHERE quota_hash=? AND used_count < 2').bind(now, quotaHash),
      this.db.prepare('UPDATE free_daily_budget SET used_count=used_count+1, updated_at=? WHERE utc_day=? AND used_count < 250').bind(now, day),
    ])
    const userChanged = n(userResult.meta?.changes) === 1
    const dailyChanged = n(dailyResult.meta?.changes) === 1
    if (userChanged && dailyChanged) return { quotaHash, day }
    if (userChanged) await this.db.prepare('UPDATE free_allowances SET used_count=MAX(0, used_count-1), updated_at=? WHERE quota_hash=?').bind(now, quotaHash).run()
    if (dailyChanged) await this.db.prepare('UPDATE free_daily_budget SET used_count=MAX(0, used_count-1), updated_at=? WHERE utc_day=?').bind(now, day).run()
    return null
  }

  async rollbackFreeQuestion(reservation: FreeReservation, now: string): Promise<void> {
    await this.db.batch([
      this.db.prepare('UPDATE free_allowances SET used_count=MAX(0, used_count-1), updated_at=? WHERE quota_hash=?').bind(now, reservation.quotaHash),
      this.db.prepare('UPDATE free_daily_budget SET used_count=MAX(0, used_count-1), updated_at=? WHERE utc_day=?').bind(now, reservation.day),
    ])
  }

  async claimAnalysis(threshold: number, aggregateJson: string, modelId: string, now: string): Promise<boolean> {
    const result = await this.db.prepare(`INSERT INTO analysis_snapshots (threshold, aggregate_json, model_id, status, created_at)
      VALUES (?, ?, ?, 'pending', ?) ON CONFLICT(threshold) DO NOTHING`).bind(threshold, aggregateJson, modelId, now).run()
    return n(result.meta?.changes) === 1
  }

  async completeAnalysis(threshold: number, analysis: string, now: string): Promise<void> {
    await this.db.prepare("UPDATE analysis_snapshots SET status='complete', analysis=?, completed_at=? WHERE threshold=?").bind(analysis, now, threshold).run()
  }

  async failAnalysis(threshold: number): Promise<void> {
    await this.db.prepare("UPDATE analysis_snapshots SET status='failed' WHERE threshold=?").bind(threshold).run()
  }
}

type ReportStructuredCounts = { responseCount?: number; completePairs?: number; modelCount?: number }

function parseReportSummary(row: Record<string, unknown>): GeneratedReportSummary | null {
  let document: ReportStructuredCounts | null = null
  try {
    document = row.structured_json ? JSON.parse(s(row.structured_json)) as ReportStructuredCounts : null
  } catch {
    document = null
  }
  const parsed = generatedReportSummarySchema.safeParse({
    id: s(row.id),
    scope: s(row.scope),
    status: s(row.status),
    title: row.title == null ? null : s(row.title),
    responseCount: n(document?.responseCount),
    completePairs: n(document?.completePairs),
    modelCount: n(document?.modelCount),
    createdAt: s(row.created_at),
    completedAt: row.completed_at == null ? null : s(row.completed_at),
  })
  return parsed.success ? parsed.data : null
}
