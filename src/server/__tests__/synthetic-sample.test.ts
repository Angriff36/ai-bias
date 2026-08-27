import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Database } from 'sql.js'

let db: Database

vi.mock('../../db/database', () => ({
  getDb: () => db,
  persist: vi.fn(),
}))

import { exportExperiments, listExperiments, listReports, seedSyntheticSample, signIn } from '../functions'

function one(sql: string, params: (string | number)[] = [], database: Database = db): unknown[] {
  return database.exec(sql, params)[0]?.values[0] ?? []
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
  it('does not create a default sample experiment on sign-in', () => {
    const first = signIn('sample-owner@example.com', 'unused')
    const second = signIn('sample-owner@example.com', 'unused')

    const experiments = listExperiments(first.token, {
      page: 1, pageSize: 20, sort: 'created_at', dir: 'desc', statuses: [], asymmetryLevels: [],
    })
    expect(experiments.total).toBe(0)
    expect(listExperiments(second.token, {
      page: 1, pageSize: 20, sort: 'created_at', dir: 'desc', statuses: [], asymmetryLevels: [],
    }).total).toBe(0)
  })

  it('keeps seeded synthetic records labeled and out of the experiment list', () => {
    const session = signIn('labeled-sample@example.com', 'unused')
    seedSyntheticSample(db, session.user.id)

    const experiments = listExperiments(session.token, {
      page: 1, pageSize: 20, sort: 'created_at', dir: 'desc', statuses: [], asymmetryLevels: [],
    })
    expect(experiments.total).toBe(0)

    const tables = ['targets', 'experiments', 'templates', 'run_batches', 'runs', 'raw_responses']
    for (const table of tables) {
      expect(one(`SELECT COUNT(*) FROM ${table} WHERE is_synthetic = 1`)[0], table).toBe(1)
    }
    expect(String(one('SELECT body FROM raw_responses WHERE is_synthetic = 1')[0])).toContain('NOT A MODEL RESPONSE')
  })

  it('rejects an unlabeled child record of a synthetic experiment', () => {
    const session = signIn('trigger-check@example.com', 'unused')
    seedSyntheticSample(db, session.user.id)
    const [experimentId] = one('SELECT id FROM experiments WHERE is_synthetic = 1')
    expect(() => db.run(
      "INSERT INTO reports (experiment_id, title, body, content_hash, is_synthetic) VALUES (?, 'bad', 'bad', 'bad', 0)",
      [Number(experimentId)],
    )).toThrow('Synthetic sample records must be labeled SYNTHETIC SAMPLE DATA')
  })

  it('does not expose synthetic report data as evidence and designates it in exports', () => {
    const sample = signIn('sample-owner@example.com', 'unused')
    const userId = sample.user.id
    seedSyntheticSample(db, userId)
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

describe('migration 0009 remove_synthetic_sample_data', () => {
  it('deletes seeded synthetic rows without foreign key errors', async () => {
    const initSqlJs = (await import('sql.js')).default
    const SQL = await initSqlJs()
    const fresh = new SQL.Database()
    fresh.run('PRAGMA foreign_keys = ON')
    const { migrations } = await import('../../db/migrations')
    for (const migration of migrations.slice(0, 8)) migration.up(fresh)
    fresh.run('INSERT INTO users (email, display_name) VALUES (?, ?)', ['migrate@test.com', 'migrate'])
    seedSyntheticSample(fresh, 1)
    expect(one('SELECT COUNT(*) FROM experiments WHERE is_synthetic = 1', [], fresh)[0]).toBe(1)

    expect(() => migrations.find((m) => m.id === '0009')!.up(fresh)).not.toThrow()
    expect(one('SELECT COUNT(*) FROM experiments WHERE is_synthetic = 1', [], fresh)[0]).toBe(0)
    expect(one('SELECT COUNT(*) FROM targets WHERE is_synthetic = 1', [], fresh)[0]).toBe(0)
  })

  it('keeps real experiments when they still point at a synthetic target', async () => {
    const initSqlJs = (await import('sql.js')).default
    const SQL = await initSqlJs()
    const fresh = new SQL.Database()
    fresh.run('PRAGMA foreign_keys = ON')
    const { migrations } = await import('../../db/migrations')
    for (const migration of migrations.slice(0, 8)) migration.up(fresh)
    fresh.run('INSERT INTO users (email, display_name) VALUES (?, ?)', ['owner@test.com', 'owner'])
    seedSyntheticSample(fresh, 1)
    const [syntheticTargetId] = one('SELECT id FROM targets WHERE is_synthetic = 1', [], fresh)
    fresh.run(
      "INSERT INTO experiments (name, status, target_id, created_by) VALUES ('Bias Test', 'complete', ?, 1)",
      [Number(syntheticTargetId)],
    )

    expect(() => migrations.find((m) => m.id === '0009')!.up(fresh)).not.toThrow()
    expect(one("SELECT COUNT(*) FROM experiments WHERE name = 'Bias Test'", [], fresh)[0]).toBe(1)
    expect(one('SELECT COUNT(*) FROM targets WHERE is_synthetic = 1', [], fresh)[0]).toBe(0)
    expect(one(
      'SELECT t.is_synthetic FROM experiments e JOIN targets t ON t.id = e.target_id WHERE e.name = ?',
      ['Bias Test'],
      fresh,
    )[0]).toBe(0)
  })
})
