import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Database } from 'sql.js'

let db: Database

vi.mock('../../db/database', () => ({
  getDb: () => db,
  persist: vi.fn(),
}))

import { exportExperiments, listExperiments, listReports, signIn } from '../functions'

function one(sql: string, params: (string | number)[] = []): unknown[] {
  return db.exec(sql, params)[0]?.values[0] ?? []
}

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  const { migrations } = await import('../../db/migrations')
  migrations.forEach((migration) => migration.up(db))
})

describe('synthetic sample account seeding', () => {
  it('creates exactly one fully labeled sample without a model call', () => {
    const first = signIn('sample-owner@example.com', 'unused')
    const second = signIn('sample-owner@example.com', 'unused')

    const experiments = listExperiments(first.token, {
      page: 1, pageSize: 20, sort: 'created_at', dir: 'desc', statuses: [], asymmetryLevels: [],
    })
    expect(experiments.total).toBe(1)
    expect(experiments.rows[0]).toMatchObject({
      is_synthetic: true,
      asymmetry_level: 'none',
      status: 'complete',
    })
    expect(listExperiments(second.token, {
      page: 1, pageSize: 20, sort: 'created_at', dir: 'desc', statuses: [], asymmetryLevels: [],
    }).total).toBe(1)

    const tables = ['targets', 'experiments', 'templates', 'run_batches', 'runs', 'raw_responses']
    for (const table of tables) {
      expect(one(`SELECT COUNT(*) FROM ${table} WHERE is_synthetic = 1`)[0], table).toBe(1)
    }
    expect(String(one('SELECT body FROM raw_responses WHERE is_synthetic = 1')[0])).toContain('NOT A MODEL RESPONSE')
    expect(String(one('SELECT body FROM raw_responses WHERE is_synthetic = 1')[0])).toContain('No provider request')
  })

  it('rejects an unlabeled child record of a synthetic experiment', () => {
    const [experimentId] = one('SELECT id FROM experiments WHERE is_synthetic = 1')
    expect(() => db.run(
      "INSERT INTO reports (experiment_id, title, body, content_hash, is_synthetic) VALUES (?, 'bad', 'bad', 'bad', 0)",
      [Number(experimentId)],
    )).toThrow('Synthetic sample records must be labeled SYNTHETIC SAMPLE DATA')
  })

  it('does not expose synthetic report data as evidence and designates it in exports', () => {
    const sample = signIn('sample-owner@example.com', 'unused')
    const userId = sample.user.id
    const [sampleExperimentId] = one('SELECT id FROM experiments WHERE is_synthetic = 1')
    db.run("INSERT INTO reports (experiment_id, title, body, content_hash, is_synthetic) VALUES (?, 'Synthetic report', 'not evidence', 'synthetic', 1)", [Number(sampleExperimentId)])
    db.run("INSERT INTO targets (name, model_id, created_by) VALUES ('Real target', 'real:model', ?)", [userId])
    const [targetId] = one("SELECT id FROM targets WHERE name = 'Real target'")
    db.run("INSERT INTO experiments (name, status, target_id, created_by) VALUES ('Real experiment', 'complete', ?, ?)", [Number(targetId), userId])
    const [realExperimentId] = one("SELECT id FROM experiments WHERE name = 'Real experiment'")
    db.run("INSERT INTO reports (experiment_id, title, body, content_hash) VALUES (?, 'Real report', 'body', 'hash')", [Number(realExperimentId)])

    expect(listReports(sample.token).map((report) => report.title)).toEqual(['Real report'])
    expect(exportExperiments(sample.token).map((row) => row.synthetic_data_designation).sort()).toEqual([
      'REAL DATA', 'SYNTHETIC SAMPLE DATA',
    ])
  })
})
