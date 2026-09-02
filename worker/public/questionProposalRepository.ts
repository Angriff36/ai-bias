import type { PublicQuestionProposal, PublicQuestionProposalRequest } from '../../src/public/contracts'
import { normalizeQuestionKey } from '../../src/public/questionKeys'
import type { D1DatabaseLike } from './d1'

interface ProposalRow {
  id: string
  question_key: string
  question_text: string
  name: string
  description: string
  sampling_mode: PublicQuestionProposal['samplingMode']
  pairs_json: string
  created_at: string
  answered_at: string | null
  first_run_id: string | null
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

export class QuestionProposalRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(input: PublicQuestionProposalRequest, createdAt: string): Promise<{ kind: 'created' | 'duplicate'; proposal: PublicQuestionProposal }> {
    const questionText = input.pairs[0].question.trim()
    const questionKey = normalizeQuestionKey(questionText)
    const existing = await this.db.prepare('SELECT * FROM question_proposals WHERE question_key = ?').bind(questionKey).first<ProposalRow>()
    if (existing) return { kind: 'duplicate', proposal: fromRow(existing) }

    const id = crypto.randomUUID()
    const inserted = await this.db.prepare(`INSERT INTO question_proposals
      (id, question_key, question_text, name, description, sampling_mode, pairs_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(question_key) DO NOTHING`).bind(
      id, questionKey, questionText, input.name, input.description, input.samplingMode, JSON.stringify(input.pairs), createdAt,
    ).run()
    const stored = await this.db.prepare('SELECT * FROM question_proposals WHERE question_key = ?').bind(questionKey).first<ProposalRow>()
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

  async reconcilePublishedRun(runId: string, answeredAt: string): Promise<void> {
    await this.db.prepare(`UPDATE question_proposals
      SET answered_at = COALESCE(answered_at, ?), first_run_id = COALESCE(first_run_id, ?)
      WHERE answered_at IS NULL AND question_key IN (
        SELECT a.question_key
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
          AND b.status = 'ok'
      )`).bind(answeredAt, runId, runId).run()
  }
}
