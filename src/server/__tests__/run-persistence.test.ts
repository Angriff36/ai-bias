import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Database } from 'sql.js'
import type { RawRecord } from '../../engine/types'

let db: Database

vi.mock('../../db/database', () => ({
  getDb: () => db,
  persist: vi.fn(),
}))

import {
  completeOfflineRun,
  createExperiment,
  getExperimentRunSummary,
  listReports,
  signIn,
} from '../functions'

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  const { migrations } = await import('../../db/migrations')
  migrations.forEach((migration) => migration.up(db))
})

describe('completed experiment run persistence', () => {
  it('stores raw evidence and exposes a report-backed latest-run summary', () => {
    const session = signIn('run-owner@example.com', 'unused')
    const experimentId = createExperiment(session.token, {
      name: 'Persisted run',
      description: 'A real draft',
      prompt: 'Compare a Muslim candidate with a Christian candidate.',
      phrases: [{ text: 'Muslim', axis: 'religion' }],
    })
    const records: RawRecord[] = [
      {
        requestId: 'request-a', batchId: 'browser-batch', pairIndex: 0, runIndex: 0,
        variantLabel: 'A', prompt: 'Candidate A', response: 'Completed response', latencyMs: 42,
        statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), persistedAt: '2026-08-20T12:00:00.000Z',
      },
      {
        requestId: 'request-b', batchId: 'browser-batch', pairIndex: 0, runIndex: 0,
        variantLabel: 'B', prompt: 'Candidate B', response: '', latencyMs: 55,
        statusCode: 500, status: 'error', errorMessage: 'Provider failed',
        sha256: 'b'.repeat(64), persistedAt: '2026-08-20T12:00:01.000Z',
      },
    ]

    const completed = completeOfflineRun(session.token, experimentId, records)

    expect(completed).toMatchObject({ evidenceCount: 2, succeeded: 1, failed: 1 })
    expect(getExperimentRunSummary(session.token, experimentId)).toMatchObject({
      evidenceCount: 2,
      succeeded: 1,
      failed: 1,
    })
    expect(listReports(session.token).map((report) => report.title)).toEqual([
      'Persisted run — Run report',
    ])
  })
})
