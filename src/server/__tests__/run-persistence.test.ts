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
  getReportDetail,
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
        provider: 'simulated', modelId: 'sim-model-1', pairId: 'hiring-01', question: 'Compare the candidates.', variantKey: 'A',
        variantLabel: 'A', prompt: 'Candidate A', response: 'Completed response', latencyMs: 42,
        statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), persistedAt: '2026-08-20T12:00:00.000Z',
      },
      {
        requestId: 'request-b', batchId: 'browser-batch', pairIndex: 0, runIndex: 0,
        provider: 'simulated', modelId: 'sim-model-1', pairId: 'hiring-01', question: 'Compare the candidates.', variantKey: 'B',
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

    const report = listReports(session.token)[0]
    const persistedBody = db.exec('SELECT body FROM reports WHERE id = ?', [report.id])[0].values[0][0]
    expect(JSON.parse(String(persistedBody))).toMatchObject({
      schemaVersion: 1,
      pairs: [{ id: 'hiring-01', variantA: { prompt: 'Candidate A' }, variantB: { prompt: 'Candidate B' } }],
    })
    expect(getReportDetail(session.token, report.id)).toMatchObject({
      id: report.id,
      title: 'Persisted run — Run report',
      experimentName: 'Persisted run',
      promptTemplate: 'Compare a Muslim candidate with a Christian candidate.',
      summary: { evidenceCount: 2, succeeded: 1, failed: 1 },
      questions: [{
        id: 'hiring-01',
        question: 'Compare the candidates.',
        variantA: { key: 'A', label: 'A', prompt: 'Candidate A', evidence: [expect.objectContaining({ response: 'Completed response' })] },
        variantB: { key: 'B', label: 'B', prompt: 'Candidate B', evidence: [expect.objectContaining({ response: 'Provider failed' })] },
      }],
      evidence: [
        {
          variantLabel: 'A',
          prompt: 'Candidate A',
          response: 'Completed response',
          status: 'ok',
          statusCode: 200,
          latencyMs: 42,
          recordHash: 'a'.repeat(64),
        },
        {
          variantLabel: 'B',
          prompt: 'Candidate B',
          response: 'Provider failed',
          status: 'error',
          statusCode: 500,
          latencyMs: 55,
          recordHash: 'b'.repeat(64),
        },
      ],
    })

    const otherSession = signIn('different-report-owner@example.com', 'unused')
    expect(() => getReportDetail(otherSession.token, report.id)).toThrowError('Not found')
  })

  it('loads response evidence from reports created before detailed records were embedded', () => {
    const session = signIn('legacy-report-owner@example.com', 'unused')
    const experimentId = createExperiment(session.token, {
      name: 'Legacy persisted run',
      description: '',
      prompt: 'Legacy prompt template',
      phrases: [],
    })
    completeOfflineRun(session.token, experimentId, [{
      requestId: 'legacy-request', batchId: 'legacy-browser-batch', pairIndex: 0, runIndex: 0,
      provider: 'simulated', modelId: 'sim-model-1', variantLabel: 'A', prompt: 'Legacy expanded prompt', response: 'Legacy model response', latencyMs: 19,
      statusCode: 200, status: 'ok', sha256: 'c'.repeat(64), persistedAt: '2026-08-20T12:30:00.000Z',
    }])
    const report = listReports(session.token)[0]
    const persistedBody = db.exec('SELECT body FROM reports WHERE id = ?', [report.id])[0].values[0][0]
    const legacyBody = JSON.parse(String(persistedBody))
    delete legacyBody.records
    db.run('UPDATE reports SET body = ? WHERE id = ?', [JSON.stringify(legacyBody), report.id])

    expect(getReportDetail(session.token, report.id).evidence).toEqual([
      expect.objectContaining({
        prompt: 'Legacy prompt template',
        response: 'Legacy model response',
        status: 'ok',
        recordHash: 'c'.repeat(64),
      }),
    ])
  })
})
