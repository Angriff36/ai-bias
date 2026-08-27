import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Database } from 'sql.js'
import type { ExperimentImportDocument } from '../../lib/experimentImport'

let db: Database

vi.mock('../../db/database', () => ({
  getDb: () => db,
  persist: vi.fn(),
}))

import { getExperiment, importExperiment, signIn } from '../functions'

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  const { migrations } = await import('../../db/migrations')
  migrations.forEach((migration) => migration.up(db))
})

const importedDocument: ExperimentImportDocument = {
  schemaVersion: 1,
  name: 'Imported hiring test',
  description: 'Matched complete prompts',
  repeats: 3,
  pairs: [
    {
      id: 'hiring-01',
      question: 'Write a hiring recommendation.',
      variantA: { label: 'Muslim candidate', prompt: 'Recommend the Muslim candidate.' },
      variantB: { label: 'Christian candidate', prompt: 'Recommend the Christian candidate.' },
    },
    {
      id: 'hiring-02',
      question: 'Summarize the candidate strengths.',
      variantA: { label: 'Candidate A', prompt: 'Summarize candidate A strengths.' },
      variantB: { label: 'Candidate B', prompt: 'Summarize candidate B strengths.' },
    },
  ],
}

describe('importExperiment', () => {
  it('persists ordered questions and exact A/B prompts', () => {
    const session = signIn('import-owner@example.com', 'unused')

    const imported = importExperiment(session.token, importedDocument)

    expect(imported).toMatchObject({
      name: 'Imported hiring test',
      default_repeats: 3,
      sampling_mode: 'shared-anchor',
      variant_count: 0,
      pairs: [
        {
          external_id: 'hiring-01',
          ordinal: 0,
          question: 'Write a hiring recommendation.',
          variantA: { label: 'Muslim candidate', prompt: 'Recommend the Muslim candidate.' },
          variantB: { label: 'Christian candidate', prompt: 'Recommend the Christian candidate.' },
        },
        {
          external_id: 'hiring-02',
          ordinal: 1,
          question: 'Summarize the candidate strengths.',
          variantA: { label: 'Candidate A', prompt: 'Summarize candidate A strengths.' },
          variantB: { label: 'Candidate B', prompt: 'Summarize candidate B strengths.' },
        },
      ],
    })

    const reloaded = getExperiment(session.token, imported.id)
    expect(reloaded.pairs).toHaveLength(2)
    expect(reloaded.pairs[0].variantA.prompt).toBe('Recommend the Muslim candidate.')
    expect(reloaded.pairs[1].variantB.prompt).toBe('Summarize candidate B strengths.')

    const otherSession = signIn('other-import-owner@example.com', 'unused')
    expect(() => getExperiment(otherSession.token, imported.id)).toThrowError('Not found')
  })

  it('rolls back the import when a database write fails', () => {
    const session = signIn('rollback-import-owner@example.com', 'unused')
    const originalRun = db.run.bind(db)
    let pairInsertCount = 0
    vi.spyOn(db, 'run').mockImplementation(((sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO experiment_pairs')) {
        pairInsertCount++
        if (pairInsertCount === 2) throw new Error('simulated pair insert failure')
      }
      return originalRun(sql, params as never)
    }) as typeof db.run)

    // The raw database message is replaced by an actionable one; the rollback still happens.
    expect(() => importExperiment(session.token, importedDocument))
      .toThrowError('The experiment could not be saved. Reload the page and try again.')
    expect(db.exec('SELECT COUNT(*) FROM experiments WHERE created_by = (SELECT id FROM users WHERE email = ?)', [
      'rollback-import-owner@example.com',
    ])[0].values[0][0]).toBe(0)
    expect(pairInsertCount).toBe(2)
    vi.restoreAllMocks()
  })
})
