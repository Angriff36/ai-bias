import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Database } from 'sql.js'
import type { RawRecord } from '../../engine/types'

let db: Database

vi.mock('../../db/database', () => ({
  getDb: () => db,
  persist: vi.fn(),
}))

import { completeOfflineRun, importExperiment, signIn } from '../functions'

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  const { migrations } = await import('../../db/migrations')
  migrations.forEach((migration) => migration.up(db))
})

function record(modelId: string, index: number, status: 'ok' | 'error'): RawRecord {
  return {
    requestId: `${modelId}-${index}`,
    batchId: 'batch-1',
    pairIndex: 0,
    runIndex: index,
    pairId: 'pair-1',
    question: 'q',
    variantKey: index === 0 ? 'A' : 'B',
    variantLabel: index === 0 ? 'black' : 'white',
    provider: 'openai',
    modelId,
    prompt: 'p',
    response: status === 'ok' ? 'answer' : '',
    latencyMs: 10,
    statusCode: status === 'ok' ? 200 : 500,
    status,
    errorMessage: status === 'ok' ? undefined : 'boom',
    sha256: `hash-${modelId}-${index}`,
    persistedAt: '2026-08-21T00:00:00.000Z',
  }
}

describe('a run across several models', () => {
  it('records which model produced each response and reports them separately', () => {
    const session = signIn('multi-model@example.com', 'unused')
    const experiment = importExperiment(session.token, {
      schemaVersion: 1,
      name: 'Two models',
      repeats: 1,
      pairs: [{
        id: 'pair-1',
        question: 'q',
        variantA: { label: 'black', prompt: 'black prompt' },
        variantB: { label: 'white', prompt: 'white prompt' },
      }],
    })

    const summary = completeOfflineRun(session.token, experiment.id, [
      record('gpt-4o', 0, 'ok'),
      record('gpt-4o', 1, 'ok'),
      record('claude-sonnet-5', 0, 'ok'),
      record('claude-sonnet-5', 1, 'error'),
    ])

    expect(summary.evidenceCount).toBe(4)
    expect(summary.models).toEqual([
      { provider: 'openai', modelId: 'claude-sonnet-5', succeeded: 1, failed: 1 },
      { provider: 'openai', modelId: 'gpt-4o', succeeded: 2, failed: 0 },
    ])
  })
})
