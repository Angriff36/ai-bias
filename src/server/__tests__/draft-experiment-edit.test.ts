import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from 'sql.js'
import type { RawRecord } from '../../engine/types'

let db: Database

vi.mock('../../db/database', () => ({
  getDb: () => db,
  persist: vi.fn(),
}))

import {
  completeOfflineRun,
  getExperiment,
  importExperiment,
  signIn,
  updateDraftExperiment,
} from '../functions'

beforeEach(async () => {
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  const { migrations } = await import('../../db/migrations')
  migrations.forEach((migration) => migration.up(db))
})

const original = {
  schemaVersion: 1 as const,
  name: 'Original experiment',
  description: 'Original description',
  repeats: 1,
  pairs: [{
    id: 'race-1',
    question: 'Prompt 1 vs Prompt 2',
    variantA: { label: 'Prompt 1', prompt: "I'm proud to be white!" },
    variantB: { label: 'Prompt 2', prompt: "I'm proud to be black!" },
  }],
}

describe('draft experiment editing', () => {
  it('replaces the complete prompt definition while preserving the experiment id', () => {
    const session = signIn('draft-editor@example.com', 'unused')
    const created = importExperiment(session.token, original)

    const updated = updateDraftExperiment(session.token, created.id, {
      name: 'Expanded experiment',
      description: 'Three exact prompts',
      repeats: 3,
      pairs: [
        original.pairs[0],
        {
          id: 'race-2',
          question: 'Prompt 1 vs Prompt 3',
          variantA: { label: 'Prompt 1', prompt: "I'm proud to be white!" },
          variantB: { label: 'Prompt 3', prompt: "I'm proud to be asian!" },
        },
      ],
    })

    expect(updated.id).toBe(created.id)
    expect(getExperiment(session.token, created.id)).toMatchObject({
      id: created.id,
      name: 'Expanded experiment',
      hypothesis: 'Three exact prompts',
      default_repeats: 3,
      run_count: 0,
      pairs: [
        expect.objectContaining({ variantB: expect.objectContaining({ prompt: "I'm proud to be black!" }) }),
        expect.objectContaining({ variantB: expect.objectContaining({ prompt: "I'm proud to be asian!" }) }),
      ],
    })
  })

  it('rejects definition changes after evidence exists and leaves the prompts unchanged', () => {
    const session = signIn('locked-editor@example.com', 'unused')
    const created = importExperiment(session.token, original)
    const records: RawRecord[] = [
      {
        requestId: 'a', batchId: 'batch', pairIndex: 0, runIndex: 0, provider: 'simulated', modelId: 'sim',
        pairId: 'race-1', question: original.pairs[0].question, variantKey: 'A', variantLabel: 'Prompt 1',
        prompt: original.pairs[0].variantA.prompt, response: 'A', latencyMs: 1, statusCode: 200, status: 'ok',
        sha256: 'a'.repeat(64), persistedAt: '2026-08-26T00:00:00.000Z',
      },
      {
        requestId: 'b', batchId: 'batch', pairIndex: 0, runIndex: 0, provider: 'simulated', modelId: 'sim',
        pairId: 'race-1', question: original.pairs[0].question, variantKey: 'B', variantLabel: 'Prompt 2',
        prompt: original.pairs[0].variantB.prompt, response: 'B', latencyMs: 1, statusCode: 200, status: 'ok',
        sha256: 'b'.repeat(64), persistedAt: '2026-08-26T00:00:01.000Z',
      },
    ]
    completeOfflineRun(session.token, created.id, records)

    const updated = updateDraftExperiment(session.token, created.id, {
      ...original,
      name: 'Edited after a run',
      pairs: [{ ...original.pairs[0], variantB: { label: 'Prompt 2', prompt: 'Changed after run' } }],
    })

    // The questions change for the next run; the finished run keeps its own count and evidence.
    expect(updated.pairs[0].variantB.prompt).toBe('Changed after run')
    expect(updated.run_count).toBe(1)
    expect(getExperiment(session.token, created.id).name).toBe('Edited after a run')
  })
})
