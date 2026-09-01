import type { ClaimAdjudication, GeneratedReportPairScore, PublicClaim, PublicEvidenceItem } from '../../src/public/contracts'
import { claimAdjudicationSchema } from '../../src/public/contracts'
import { normalizeQuestionKey } from '../../src/public/questionKeys'
import {
  adjudicateClaim,
  buildClaimEvidenceSummary,
  type ClaimEvaluationModel,
} from './claimAdjudication'
import type { D1DatabaseLike } from './d1'
import { indexEvidenceByQuestionKey } from './questionLeaderboard'
import { readCachedClaims, writeCachedClaims } from './readCache'
import { REPORT_DIMENSIONS } from './reportDimensions'

const n = (value: unknown) => Number(value ?? 0)
const s = (value: unknown) => String(value ?? '')

const evidenceSelect = `SELECT id, run_id, pair_index, run_index, question, variant_key, variant_label,
  provider, model_id, prompt, response, latency_ms, status_code, status, error_message, truncated,
  evidence_sha256, classification, received_at
  FROM public_evidence`

const DAILY_CLAIM_LIMIT = 200

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

function parseKeys(json: string): string[] {
  try {
    const value = JSON.parse(json) as unknown
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function shortModelLabel(modelId: string): string {
  return modelId.split('/').pop()?.trim() || modelId
}

/**
 * How far apart the judge scored the two sides of one pair, 0–1: the mean
 * absolute gap across the seven 0–3 dimensions, divided by the 3-point range.
 */
export function judgedPairGap(score: GeneratedReportPairScore): number {
  const total = REPORT_DIMENSIONS.reduce((sum, dimension) => sum + Math.abs(score.variantB[dimension.id] - score.variantA[dimension.id]), 0)
  return total / (REPORT_DIMENSIONS.length * 3)
}

/**
 * The answer to a claim, computed from the evidence of its attached questions. Nobody types these numbers.
 * The bias score is the judge model's verdict: the mean gap between the two sides of every judged pair
 * (VISION.md section 5 dimensions). Refusals only feed the match rate. No judged pairs → no score.
 */
export function computeClaimAnswer(
  evidence: PublicEvidenceItem[],
  judged: GeneratedReportPairScore[] = [],
): Pick<PublicClaim, 'testCount' | 'matchRate' | 'biasScore' | 'models' | 'lastSeenAt'> {
  const testCount = evidence.length
  const answered = evidence.filter((item) => item.classification === 'answered').length
  const ids = new Set(evidence.map((item) => item.id))
  const scoped = new Map<string, GeneratedReportPairScore>()
  for (const score of judged) {
    if (ids.has(score.variantAEvidenceId) || ids.has(score.variantBEvidenceId)) scoped.set(score.pairSampleId, score)
  }
  const gaps = [...scoped.values()].map(judgedPairGap)
  const models = [...new Set(evidence.map((item) => shortModelLabel(item.modelId)))]
  return {
    testCount,
    matchRate: testCount > 0 ? Math.round((answered / testCount) * 100) : null,
    biasScore: gaps.length > 0 ? Math.round((gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) * 100) / 100 : null,
    models,
    lastSeenAt: evidence.reduce<string | null>((latest, item) => (latest == null || item.receivedAt > latest ? item.receivedAt : latest), null),
  }
}

interface ReportKeyRow { id: string; title: string | null; keys: Set<string> }

export type ClaimCreateResult =
  | { kind: 'created' | 'duplicate'; claim: PublicClaim }
  | { kind: 'limited' }

export class ClaimRepository {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly evaluator?: ClaimEvaluationModel,
  ) {}

  async list(): Promise<PublicClaim[]> {
    const cached = readCachedClaims()
    if (cached) return cached
    const rows = (await this.db.prepare(`SELECT id, text, question_keys_json, created_at,
      adjudication_json, evidence_fingerprint, evaluated_at, evaluation_status, evaluation_error
      FROM claims ORDER BY created_at DESC`).all()).results ?? []
    if (rows.length === 0) {
      writeCachedClaims([])
      return []
    }
    const evidence = ((await this.db.prepare(`${evidenceSelect} ORDER BY received_at, id`).all()).results ?? []).map(mapEvidenceRow)
    const byKey = indexEvidenceByQuestionKey(evidence)
    const reports = await this.completeReportKeys()
    const judged = await this.completeReportPairScores()
    const claims: PublicClaim[] = []
    for (const row of rows) {
      const questionKeys = parseKeys(s(row.question_keys_json))
      const scoped = questionKeys.flatMap((key) => byKey.get(key) ?? [])
      const wanted = new Set(questionKeys)
      const adjudication = await this.claimAdjudication(row, s(row.text), questionKeys, evidence, judged)
      claims.push({
        id: s(row.id),
        text: s(row.text),
        questionKeys,
        createdAt: s(row.created_at),
        ...computeClaimAnswer(scoped, judged),
        ...adjudication,
        reports: reports
          .filter((report) => [...report.keys].some((key) => wanted.has(key)))
          .map((report) => ({ id: report.id, title: report.title })),
      })
    }
    writeCachedClaims(claims)
    return claims
  }

  private async claimAdjudication(
    row: Record<string, unknown>,
    claimText: string,
    questionKeys: string[],
    evidence: PublicEvidenceItem[],
    judged: GeneratedReportPairScore[],
  ): Promise<Pick<PublicClaim,
    'evaluationStatus' | 'verdict' | 'confidence' | 'answer' | 'reasoning' | 'supportingFindings'
    | 'counterFindings' | 'modelFindings' | 'coverage' | 'evaluatedAt'>> {
    const summary = await buildClaimEvidenceSummary(questionKeys, evidence, judged)
    const stored = this.readStoredAdjudication(row)
    if (stored && s(row.evidence_fingerprint) === summary.evidenceFingerprint && s(row.evaluation_status) === 'complete') {
      return { evaluationStatus: 'complete', ...stored, evaluatedAt: row.evaluated_at == null ? null : s(row.evaluated_at) }
    }
    if (!this.evaluator && summary.coverage.judgedPairs > 0) {
      return this.emptyAdjudication('pending', summary.coverage)
    }
    const evaluatedAt = new Date().toISOString()
    try {
      const evaluator = this.evaluator ?? { evaluate: async () => { throw new Error('Claim evaluator is unavailable.') } }
      const adjudication = await adjudicateClaim(claimText, summary, evaluator)
      await this.db.prepare(`UPDATE claims SET adjudication_json = ?, evidence_fingerprint = ?, evaluated_at = ?,
        evaluation_status = 'complete', evaluation_error = NULL WHERE id = ?`)
        .bind(JSON.stringify(adjudication), summary.evidenceFingerprint, evaluatedAt, s(row.id)).run()
      return { evaluationStatus: 'complete', ...adjudication, evaluatedAt }
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Claim evaluation failed.'
      await this.db.prepare(`UPDATE claims SET evidence_fingerprint = ?, evaluated_at = ?,
        evaluation_status = 'failed', evaluation_error = ? WHERE id = ?`)
        .bind(summary.evidenceFingerprint, evaluatedAt, message, s(row.id)).run()
      return this.emptyAdjudication('failed', summary.coverage, evaluatedAt)
    }
  }

  private readStoredAdjudication(row: Record<string, unknown>): ClaimAdjudication | null {
    if (!row.adjudication_json) return null
    try {
      const parsed = claimAdjudicationSchema.safeParse(JSON.parse(s(row.adjudication_json)))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  private emptyAdjudication(
    evaluationStatus: 'pending' | 'failed',
    coverage: PublicClaim['coverage'],
    evaluatedAt: string | null = null,
  ): Pick<PublicClaim,
    'evaluationStatus' | 'verdict' | 'confidence' | 'answer' | 'reasoning' | 'supportingFindings'
    | 'counterFindings' | 'modelFindings' | 'coverage' | 'evaluatedAt'> {
    return {
      evaluationStatus,
      verdict: null,
      confidence: null,
      answer: null,
      reasoning: null,
      supportingFindings: [],
      counterFindings: [],
      modelFindings: [],
      coverage,
      evaluatedAt,
    }
  }

  async create(text: string, questionKeys: string[], now: string): Promise<ClaimCreateResult> {
    const cleanText = text.trim().replace(/\s+/g, ' ')
    const id = crypto.randomUUID()
    const keys = [...new Set(questionKeys.map((key) => normalizeQuestionKey(key)))]
    const start = `${now.slice(0, 10)}T00:00:00.000Z`
    // One atomic statement: the row is written only while today's count is under the cap,
    // and the unique index on lower(text) collapses concurrent duplicate posts to one row.
    // An over-cap row is never written, so it can never be read by another request.
    await this.db.prepare(`INSERT INTO claims (id, text, question_keys_json, created_at)
      SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM claims WHERE created_at >= ?) < ?
      ON CONFLICT DO NOTHING`)
      .bind(id, cleanText, JSON.stringify(keys), now, start, DAILY_CLAIM_LIMIT).run()
    const stored = await this.db.prepare('SELECT id FROM claims WHERE lower(text) = lower(?) LIMIT 1').bind(cleanText).first<{ id: string }>()
    if (!stored) return { kind: 'limited' }
    writeCachedClaims(null)
    const claim = (await this.list()).find((item) => item.id === stored.id)
    if (!claim) throw new Error('Could not read the claim back.')
    return { kind: stored.id === id ? 'created' : 'duplicate', claim }
  }

  /** Every judge verdict from a finished report, oldest report first so a newer verdict for the same pair wins. */
  private async completeReportPairScores(): Promise<GeneratedReportPairScore[]> {
    const rows = (await this.db.prepare(`SELECT p.score_json FROM report_pair_scores p
      JOIN generated_reports r ON r.id = p.report_id WHERE r.status='complete' ORDER BY r.completed_at, r.id`).all()).results ?? []
    const scores: GeneratedReportPairScore[] = []
    for (const row of rows) {
      try { scores.push(JSON.parse(s(row.score_json)) as GeneratedReportPairScore) } catch { /* an unreadable score adds nothing */ }
    }
    return scores
  }

  /** Which leaderboard questions each complete report actually used — a real link, not a topic guess. */
  private async completeReportKeys(): Promise<ReportKeyRow[]> {
    const rows = (await this.db.prepare(`SELECT id, title, question_keys_json, structured_json FROM generated_reports WHERE status='complete'`).all()).results ?? []
    return rows.map((row) => {
      const keys = new Set(parseKeys(s(row.question_keys_json)))
      if (keys.size === 0 && row.structured_json) {
        try {
          // Legacy reports stored placeholder questions; derive keys the same way the leaderboard does.
          const document = JSON.parse(s(row.structured_json)) as { evidence?: PublicEvidenceItem[] }
          for (const key of indexEvidenceByQuestionKey(document.evidence ?? []).keys()) {
            if (key !== '__missing_question__') keys.add(key)
          }
        } catch {
          // A report with unreadable JSON simply links to no claims.
        }
      }
      return { id: s(row.id), title: row.title == null ? null : s(row.title), keys }
    })
  }
}
