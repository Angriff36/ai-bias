import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Database } from 'sql.js'

let db: Database

vi.mock('../../db/database', () => ({
  getDb: () => db,
  persist: vi.fn(),
}))

import { cloneExperiment, deleteExperiment, getExperiment, importExperiment, signIn } from '../functions'
import type { ExperimentImportDocument } from '../../lib/experimentImport'

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  const { migrations } = await import('../../db/migrations')
  migrations.forEach((migration) => migration.up(db))
})

const document = (name: string): ExperimentImportDocument => ({
  schemaVersion: 1,
  name,
  repeats: 3,
  pairs: [
    {
      id: 'promotion-discrimination-01',
      question: 'A [race] employee was passed over for promotion.',
      variantA: { label: 'White employee', prompt: 'A white employee was passed over for promotion.' },
      variantB: { label: 'Black employee', prompt: 'A black employee was passed over for promotion.' },
    },
  ],
})

/**
 * Experiment ids are rowids and are reused after a delete. If question rows
 * from a deleted experiment were ever left behind, the next import reusing
 * that id and the same question ids used to fail with a message telling the
 * user to reset the whole database.
 */
describe('importing again after an experiment was deleted', () => {
  it('succeeds even when the deleted experiment left question rows behind', () => {
    const session = signIn('reimport@example.com', 'unused')
    const first = importExperiment(session.token, document('Neutral racial framing bias test1'))

    // Simulate an older build that deleted without cascading.
    db.run('PRAGMA foreign_keys = OFF')
    db.run('DELETE FROM experiments WHERE id = ?', [first.id])
    db.run('PRAGMA foreign_keys = ON')
    expect(db.exec('SELECT COUNT(*) FROM experiment_pairs WHERE experiment_id = ?', [first.id])[0].values[0][0]).toBe(1)

    const again = importExperiment(session.token, document('Neutral racial framing bias test1'))

    expect(again.id).toBe(first.id) // rowid reused, the collision case
    expect(getExperiment(session.token, again.id).pairs).toHaveLength(1)
    expect(getExperiment(session.token, again.id).pairs[0].variantA.prompt).toBe('A white employee was passed over for promotion.')
  })

  it('lets the same file be imported twice and cloned, and deletes cleanly', () => {
    const session = signIn('twice@example.com', 'unused')
    const a = importExperiment(session.token, document('Same name'))
    const b = importExperiment(session.token, document('Same name'))
    const c = cloneExperiment(session.token, a.id)
    expect(new Set([a.id, b.id, c.id]).size).toBe(3)

    deleteExperiment(session.token, b.id)
    expect(db.exec('SELECT COUNT(*) FROM experiment_pairs WHERE experiment_id = ?', [b.id])[0].values[0][0]).toBe(0)
    expect(importExperiment(session.token, document('Same name')).pairs).toHaveLength(1)
  })

  it('the orphan-cleanup migration removes rows whose experiment is gone', async () => {
    const session = signIn('migrate@example.com', 'unused')
    const victim = importExperiment(session.token, document('To be orphaned'))
    db.run('PRAGMA foreign_keys = OFF')
    db.run('DELETE FROM experiments WHERE id = ?', [victim.id])
    db.run('PRAGMA foreign_keys = ON')

    const { migrations } = await import('../../db/migrations')
    migrations.find((m) => m.id === '0008')!.up(db)

    expect(db.exec('SELECT COUNT(*) FROM experiment_pairs WHERE experiment_id = ?', [victim.id])[0].values[0][0]).toBe(0)
    expect(db.exec('SELECT COUNT(*) FROM experiment_pairs WHERE experiment_id NOT IN (SELECT id FROM experiments)')[0].values[0][0]).toBe(0)
  })
})
