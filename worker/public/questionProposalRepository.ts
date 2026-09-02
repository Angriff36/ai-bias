import type { PublicQuestionProposal, PublicQuestionProposalPair, PublicQuestionProposalRequest } from '../../src/public/contracts'
import { normalizeQuestionKey } from '../../src/public/questionKeys'
import type { D1DatabaseLike } from './d1'

interface ProposalRow {
  id: string
  question_key: string
  group_key: string
  question_text: string
  name: string
  description: string
  sampling_mode: PublicQuestionProposal['samplingMode']
  pairs_json: string
  created_at: string
  answered_at: string | null
  first_run_id: string | null
}

/** One key per compared group set, so the same comparison is proposed only once per question. */
export function proposalGroupKey(pairs: PublicQuestionProposalPair[]): string {
  const labels = new Set<string>()
  for (const pair of pairs) {
    labels.add(pair.variantA.label.trim().toLowerCase())
    labels.add(pair.variantB.label.trim().toLowerCase())
  }
  return [...labels].sort().join('|')
}

function fromRow(row: ProposalRow): PublicQuestionProposal {
  return {
    id: row.id,
    questionKey: row.question_key,
    questionText: row.question_text,
    name: row.name,
    description: row.description,
    samplingMode: row.sampling_mode,
    pairs: JSON.parse(row.pairs_json) as PublicQuestionProposal['pairs'],
    status: row.answered_at ? 'answered' : 'unanswered',
    createdAt: row.created_at,
    answeredAt: row.answered_at,
    firstRunId: row.first_run_id,
  }
}

/** Rows written before migration 0013 have an empty stored group key; derive it from their pairs. */
function rowGroupKey(row: ProposalRow): string {
  return row.group_key || proposalGroupKey(JSON.parse(row.pairs_json) as PublicQuestionProposalPair[])
}

export class QuestionProposalRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(input: PublicQuestionProposalRequest, createdAt: string): Promise<{ kind: 'created' | 'duplicate'; proposal: PublicQuestionProposal }> {
    const questionText = input.pairs[0].question.trim()
    const questionKey = normalizeQuestionKey(questionText)
    const groupKey = proposalGroupKey(input.pairs)
    const sameQuestion = await this.db.prepare('SELECT * FROM question_proposals WHERE question_key = ?').bind(questionKey).all<ProposalRow>()
    const existing = (sameQuestion.results ?? []).find((row) => rowGroupKey(row) === groupKey)
    if (existing) return { kind: 'duplicate', proposal: fromRow(existing) }

    const id = crypto.randomUUID()
    const inserted = await this.db.prepare(`INSERT INTO question_proposals
      (id, question_key, group_key, question_text, name, description, sampling_mode, pairs_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(question_key, group_key) DO NOTHING`).bind(
      id, questionKey, groupKey, questionText, input.name, input.description, input.samplingMode, JSON.stringify(input.pairs), createdAt,
    ).run()
    const stored = await this.db.prepare('SELECT * FROM question_proposals WHERE question_key = ? AND group_key = ?').bind(questionKey, groupKey).first<ProposalRow>()
    if (!stored) throw new Error('Could not read the question proposal back.')
    return {
      kind: (inserted.meta?.changes ?? 0) > 0 ? 'created' : 'duplicate',
      proposal: fromRow(stored),
    }
  }

  async list(status: 'unanswered' | 'answered' = 'unanswered'): Promise<PublicQuestionProposal[]> {
    const condition = status === 'answered' ? 'answered_at IS NOT NULL' : 'answered_at IS NULL'
    const result = await this.db.prepare(`SELECT * FROM question_proposals WHERE ${condition} ORDER BY created_at DESC`).all<ProposalRow>()
    return (result.results ?? []).map(fromRow)
  }

  async get(id: string): Promise<PublicQuestionProposal | null> {
    const row = await this.db.prepare('SELECT * FROM question_proposals WHERE id = ?').bind(id).first<ProposalRow>()
    return row ? fromRow(row) : null
  }

  /**
   * A proposal is answered only by a complete A/B pair for its question whose
   * group labels match one of its proposed comparisons, so a run about other
   * groups never answers a proposal for untested groups.
   */
  async reconcilePublishedRun(runId: string, answeredAt: string): Promise<void> {
    const complete = await this.db.prepare(`SELECT a.question_key AS question_key, a.variant_label AS label_a, b.variant_label AS label_b
      FROM public_evidence a
      JOIN public_evidence b
        ON b.run_id = a.run_id
       AND b.pair_index = a.pair_index
       AND b.run_index = a.run_index
       AND b.provider = a.provider
       AND b.model_id = a.model_id
       AND b.question_key = a.question_key
      WHERE a.run_id = ?
        AND a.variant_key = 'A'
        AND b.variant_key = 'B'
        AND a.status = 'ok'
        AND b.status = 'ok'`).bind(runId).all<{ question_key: string; label_a: string; label_b: string }>()
    const answered = new Set<string>()
    for (const row of complete.results ?? []) {
      const a = row.label_a.trim().toLowerCase()
      const b = row.label_b.trim().toLowerCase()
      answered.add(`${row.question_key}::${a}|${b}`)
      answered.add(`${row.question_key}::${b}|${a}`)
    }
    if (answered.size === 0) return

    const open = await this.db.prepare('SELECT * FROM question_proposals WHERE answered_at IS NULL').all<ProposalRow>()
    for (const row of open.results ?? []) {
      const pairs = JSON.parse(row.pairs_json) as PublicQuestionProposalPair[]
      const covered = pairs.some((pair) => (
        answered.has(`${row.question_key}::${pair.variantA.label.trim().toLowerCase()}|${pair.variantB.label.trim().toLowerCase()}`)
      ))
      if (!covered) continue
      await this.db.prepare(`UPDATE question_proposals
        SET answered_at = COALESCE(answered_at, ?), first_run_id = COALESCE(first_run_id, ?)
        WHERE id = ? AND answered_at IS NULL`).bind(answeredAt, runId, row.id).run()
    }
  }
}
