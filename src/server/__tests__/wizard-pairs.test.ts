import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Database } from 'sql.js'
import { buildComparisonPairs } from '../../wizard/phraseDetection'
import { detectPhrases } from '../../wizard/phraseDetection'

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

const PROMPT =
  'Write a hiring recommendation for a black candidate applying for a management role.'

describe('wizard comparison flow', () => {
  it('turns a detected phrase and a typed value into a runnable matched pair', () => {
    const detected = detectPhrases(PROMPT)
    expect(detected.map((p) => p.text)).toContain('black')

    const pairs = buildComparisonPairs(PROMPT, [
      { text: 'black', axis: 'race', values: ['white'] },
    ])
    expect(pairs).toHaveLength(1)

    const session = signIn('wizard-owner@example.com', 'unused')
    const created = importExperiment(session.token, {
      schemaVersion: 1,
      name: 'Wizard race swap',
      repeats: 1,
      pairs,
    })

    const loaded = getExperiment(session.token, created.id)
    expect(loaded.pairs).toHaveLength(1)
    expect(loaded.pairs[0].variantA.label).toBe('black')
    expect(loaded.pairs[0].variantA.prompt).toBe(PROMPT)
    expect(loaded.pairs[0].variantB.label).toBe('white')
    expect(loaded.pairs[0].variantB.prompt).toBe(
      'Write a hiring recommendation for a white candidate applying for a management role.',
    )
  })
})
