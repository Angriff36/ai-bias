import type { PublicClaim, PublicEvidenceItem } from '../../src/public/contracts'
import { normalizeQuestionKey } from '../../src/public/questionKeys'
import type { D1DatabaseLike } from './d1'
import { indexEvidenceByQuestionKey } from './questionLeaderboard'
import { readCachedClaims, writeCachedClaims } from './readCache'
import { completePairGroups } from './reportGlobalCohort'

const n = (value: unknown) => Number(value ?? 0)
const s = (value: unknown) => String(value ?? '')

// No response text: the claim answer needs only prompts, classes, and pair identity.
const evidenceSelect = `SELECT id, run_id, pair_index, run_index, question, variant_key, variant_label,
  provider, model_id, prompt, status, classification, received_at
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

/** The answer to a claim, computed from the evidence of its attached questions. Nobody types these numbers. */
export function computeClaimAnswer(evidence: PublicEvidenceItem[]): Pick<PublicClaim, 'testCount' | 'matchRate' | 'biasScore' | 'models' | 'lastSeenAt'> {
  const testCount = evidence.length
  const answered = evidence.filter((item) => item.classification === 'answered').length
  const pairs = completePairGroups(evidence)
  const asymmetric = pairs.filter((group) => {
    const a = group.find((item) => item.variantKey === 'A')
    const b = group.find((item) => item.variantKey === 'B')
    return a && b && a.classification !== b.classification
  }).length
  const models = [...new Set(evidence.map((item) => shortModelLabel(item.modelId)))]
  return {
    testCount,
    matchRate: testCount > 0 ? Math.round((answered / testCount) * 100) : null,
    biasScore: pairs.length > 0 ? Math.round((asymmetric / pairs.length) * 100) / 100 : null,
    models,
    lastSeenAt: evidence.reduce<string | null>((latest, item) => (latest == null || item.receivedAt > latest ? item.receivedAt : latest), null),
  }
}

interface ReportKeyRow { id: string; title: string | null; keys: Set<string> }

export type ClaimCreateResult =
  | { kind: 'created' | 'duplicate'; claim: PublicClaim }
  | { kind: 'limited' }

export class ClaimRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async list(): Promise<PublicClaim[]> {
    const cached = readCachedClaims()
    if (cached) return cached
    const rows = (await this.db.prepare('SELECT id, text, question_keys_json, created_at FROM claims ORDER BY created_at DESC').all()).results ?? []
    if (rows.length === 0) {
      writeCachedClaims([])
      return []
    }
    const evidence = ((await this.db.prepare(`${evidenceSelect} ORDER BY received_at, id`).all()).results ?? []).map(mapEvidenceRow)
    const byKey = indexEvidenceByQuestionKey(evidence)
    const reports = await this.completeReportKeys()
    const claims = rows.map((row) => {
      const questionKeys = parseKeys(s(row.question_keys_json))
      const scoped = questionKeys.flatMap((key) => byKey.get(key) ?? [])
      const wanted = new Set(questionKeys)
      return {
        id: s(row.id),
        text: s(row.text),
        questionKeys,
        createdAt: s(row.created_at),
        ...computeClaimAnswer(scoped),
        reports: reports
          .filter((report) => [...report.keys].some((key) => wanted.has(key)))
          .map((report) => ({ id: report.id, title: report.title })),
      }
    })
    writeCachedClaims(claims)
    return claims
  }

  async create(text: string, questionKeys: string[], now: string): Promise<ClaimCreateResult> {
    const cleanText = text.trim().replace(/\s+/g, ' ')
    const id = crypto.randomUUID()
    const keys = [...new Set(questionKeys.map((key) => normalizeQuestionKey(key)))]
    // The unique index on lower(text) makes concurrent duplicate posts collapse to one row.
    await this.db.prepare('INSERT INTO claims (id, text, question_keys_json, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING')
      .bind(id, cleanText, JSON.stringify(keys), now).run()
    const stored = await this.db.prepare('SELECT id FROM claims WHERE lower(text) = lower(?) LIMIT 1').bind(cleanText).first<{ id: string }>()
    if (!stored) throw new Error('Could not read the claim back.')
    if (stored.id === id) {
      const start = `${now.slice(0, 10)}T00:00:00.000Z`
      const today = await this.db.prepare('SELECT COUNT(*) AS count FROM claims WHERE created_at >= ?').bind(start).first<{ count: number }>()
      if (n(today?.count) > DAILY_CLAIM_LIMIT) {
        // Concurrent posts can all pass a pre-check; the row that pushed the day over the cap backs out.
        await this.db.prepare('DELETE FROM claims WHERE id=?').bind(id).run()
        return { kind: 'limited' }
      }
    }
    writeCachedClaims(null)
    const claim = (await this.list()).find((item) => item.id === stored.id)
    if (!claim) throw new Error('Could not read the claim back.')
    return { kind: stored.id === id ? 'created' : 'duplicate', claim }
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
