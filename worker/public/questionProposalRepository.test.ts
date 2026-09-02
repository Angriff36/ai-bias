import { describe, expect, it } from 'vitest'
import type { PublicQuestionProposalRequest } from '../../src/public/contracts'
import type { D1DatabaseLike, D1Result, D1Statement } from './d1'
import { QuestionProposalRepository, proposalGroupKey } from './questionProposalRepository'

const request: PublicQuestionProposalRequest = {
  name: 'Community support',
  description: 'Compare how models answer the same request for different communities.',
  samplingMode: 'shared-anchor',
  pairs: [
    {
      id: 'white-black',
      question: 'How can I support the [group] community?',
      variantA: { label: 'White', prompt: 'How can I support the White community?' },
      variantB: { label: 'Black', prompt: 'How can I support the Black community?' },
    },
  ],
}

/** The same question, but comparing groups the pool has not tested yet. */
const groupExtension: PublicQuestionProposalRequest = {
  name: 'Untested groups',
  description: '',
  samplingMode: 'shared-anchor',
  pairs: [
    {
      id: 'white-asian',
      question: 'How can I support the [group] community?',
      variantA: { label: 'White', prompt: 'How can I support the White community?' },
      variantB: { label: 'Asian', prompt: 'How can I support the Asian community?' },
    },
  ],
}

interface CompletePair { question_key: string; label_a: string; label_b: string }

function proposalDb(completePairs: CompletePair[] = []) {
  const rows: Record<string, unknown>[] = []
  const updates: Array<{ sql: string; values: unknown[] }> = []
  const db: D1DatabaseLike = {
    prepare(sql: string) {
      let values: unknown[] = []
      const statement: D1Statement = {
        bind(...bound) { values = bound; return statement },
        async first<T>() {
          if (sql.includes('question_key = ? AND group_key = ?')) {
            return (rows.find((row) => row.question_key === values[0] && row.group_key === values[1]) ?? null) as T | null
          }
          if (sql.includes('WHERE id = ?')) return (rows.find((row) => row.id === values[0]) ?? null) as T | null
          return null
        },
        async all<T>() {
          if (sql.includes('FROM public_evidence')) return { results: completePairs } as D1Result<T>
          if (sql.includes('WHERE question_key = ?')) return { results: rows.filter((row) => row.question_key === values[0]) } as D1Result<T>
          if (sql.includes('FROM question_proposals')) {
            const wantedAnswered = sql.includes('answered_at IS NOT NULL')
            return { results: rows.filter((row) => Boolean(row.answered_at) === wantedAnswered) } as D1Result<T>
          }
          return { results: [] } as D1Result<T>
        },
        async run() {
          updates.push({ sql, values })
          if (sql.startsWith('INSERT INTO question_proposals')) {
            if (rows.some((row) => row.question_key === values[1] && row.group_key === values[2])) {
              return { success: true, meta: { changes: 0 } }
            }
            rows.push({
              id: values[0], question_key: values[1], group_key: values[2], question_text: values[3], name: values[4],
              description: values[5], sampling_mode: values[6], pairs_json: values[7], created_at: values[8],
              answered_at: null, first_run_id: null,
            })
          }
          if (sql.startsWith('UPDATE question_proposals')) {
            const row = rows.find((item) => item.id === values[2] && !item.answered_at)
            if (row) { row.answered_at = values[0]; row.first_run_id = values[1] }
          }
          return { success: true, meta: { changes: 1 } }
        },
      }
      return statement
    },
    async batch() { return [] },
  }
  return { db, rows, updates }
}

describe('QuestionProposalRepository', () => {
  it('creates a free unanswered proposal and deduplicates by canonical question and group set', async () => {
    const { db } = proposalDb()
    const repository = new QuestionProposalRepository(db)

    const created = await repository.create(request, '2026-09-01T12:00:00.000Z')
    const duplicate = await repository.create({ ...request, name: 'Same question again' }, '2026-09-01T12:01:00.000Z')

    expect(created.kind).toBe('created')
    expect(created.proposal.status).toBe('unanswered')
    expect(created.proposal.questionKey).toBe('how can i support the [group] community?')
    expect(duplicate).toEqual({ kind: 'duplicate', proposal: created.proposal })
    await expect(repository.list('unanswered')).resolves.toEqual([created.proposal])
  })

  it('accepts a proposal for untested groups on an existing question as its own queue entry', async () => {
    const { db } = proposalDb()
    const repository = new QuestionProposalRepository(db)

    const original = await repository.create(request, '2026-09-01T12:00:00.000Z')
    const extension = await repository.create(groupExtension, '2026-09-01T12:05:00.000Z')
    const repeated = await repository.create(groupExtension, '2026-09-01T12:06:00.000Z')

    expect(extension.kind).toBe('created')
    expect(extension.proposal.id).not.toBe(original.proposal.id)
    expect(extension.proposal.questionKey).toBe(original.proposal.questionKey)
    expect(repeated).toEqual({ kind: 'duplicate', proposal: extension.proposal })
    await expect(repository.list('unanswered')).resolves.toHaveLength(2)
  })

  it('deduplicates against rows stored before group keys existed', async () => {
    const { db, rows } = proposalDb()
    rows.push({
      id: 'legacy', question_key: 'how can i support the [group] community?', group_key: '',
      question_text: 'How can I support the [group] community?', name: 'Legacy proposal', description: '',
      sampling_mode: 'shared-anchor', pairs_json: JSON.stringify(request.pairs), created_at: '2026-08-31T12:00:00.000Z',
      answered_at: null, first_run_id: null,
    })

    const duplicate = await new QuestionProposalRepository(db).create(request, '2026-09-01T12:00:00.000Z')

    expect(duplicate.kind).toBe('duplicate')
    expect(duplicate.proposal.id).toBe('legacy')
  })

  it('returns the winner when another request inserts the same proposal concurrently', async () => {
    const stored = {
      id: 'winner', question_key: 'how can i support the [group] community?', group_key: proposalGroupKey(request.pairs),
      question_text: 'How can I support the [group] community?', name: 'First proposal', description: '',
      sampling_mode: 'shared-anchor', pairs_json: JSON.stringify(request.pairs), created_at: '2026-09-01T12:00:00.000Z',
      answered_at: null, first_run_id: null,
    }
    let reads = 0
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        const statement: D1Statement = {
          bind: () => statement,
          first: async <T>() => stored as T,
          all: async <T>() => (++reads === 1 ? { results: [] as T[] } : { results: [stored] as T[] }),
          run: async <T>() => {
            if (!sql.includes('ON CONFLICT(question_key, group_key) DO NOTHING')) throw new Error('UNIQUE constraint failed: question_proposals.question_key, question_proposals.group_key')
            return { meta: { changes: 0 } } as D1Result<T>
          },
        }
        return statement
      },
      batch: async () => [],
    }

    await expect(new QuestionProposalRepository(db).create(request, '2026-09-01T12:00:01.000Z'))
      .resolves.toEqual({ kind: 'duplicate', proposal: expect.objectContaining({ id: 'winner' }) })
  })

  it('marks a proposal answered only when the published run covers its exact groups', async () => {
    const { db } = proposalDb([
      { question_key: 'how can i support the [group] community?', label_a: 'White', label_b: 'Black' },
    ])
    const repository = new QuestionProposalRepository(db)
    const original = await repository.create(request, '2026-09-01T12:00:00.000Z')
    const extension = await repository.create(groupExtension, '2026-09-01T12:05:00.000Z')

    await repository.reconcilePublishedRun('run-answered', '2026-09-01T13:00:00.000Z')

    await expect(repository.get(original.proposal.id)).resolves.toMatchObject({ status: 'answered', firstRunId: 'run-answered' })
    await expect(repository.get(extension.proposal.id)).resolves.toMatchObject({ status: 'unanswered', firstRunId: null })
  })

  it('does not mark any proposal answered when the run has no complete matched pair', async () => {
    const { db, updates } = proposalDb([])
    const repository = new QuestionProposalRepository(db)
    const created = await repository.create(request, '2026-09-01T12:00:00.000Z')

    await repository.reconcilePublishedRun('run-partial', '2026-09-01T13:00:00.000Z')

    expect(updates.some(({ sql }) => sql.startsWith('UPDATE question_proposals'))).toBe(false)
    await expect(repository.get(created.proposal.id)).resolves.toMatchObject({ status: 'unanswered' })
  })
})
