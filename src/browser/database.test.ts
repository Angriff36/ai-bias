import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { getExperiment, importExperiment, signIn } from '../server/functions'
import { openBrowserDatabase, type BrowserDatabaseStorage } from './database'

class MemoryDatabaseStorage implements BrowserDatabaseStorage {
  bytes: Uint8Array | null = null

  async load(): Promise<Uint8Array | null> {
    return this.bytes?.slice() ?? null
  }

  async save(bytes: Uint8Array): Promise<void> {
    this.bytes = bytes.slice()
  }

  async clear(): Promise<void> {
    this.bytes = null
  }
}

describe('browser-local SQLite', () => {
  it('persists experiment data in browser storage without a server request', async () => {
    const storage = new MemoryDatabaseStorage()
    const initialize = () => initSqlJs()
    const first = await openBrowserDatabase(storage, initialize)
    const token = signIn('browser@local', '').token
    const created = importExperiment(token, {
      schemaVersion: 1,
      name: 'Private browser experiment',
      repeats: 1,
      pairs: [{
        id: 'q1',
        question: 'A private matched prompt',
        variantA: { label: 'A', prompt: 'Prompt A stays local.' },
        variantB: { label: 'B', prompt: 'Prompt B stays local.' },
      }],
    })
    await first.flush()
    first.database.close?.()

    expect(storage.bytes?.byteLength).toBeGreaterThan(0)

    const reopened = await openBrowserDatabase(storage, initialize)
    const reopenedToken = signIn('browser@local', '').token
    const loaded = getExperiment(reopenedToken, created.id)

    expect(loaded.name).toBe('Private browser experiment')
    expect(loaded.pairs[0].variantB.prompt).toBe('Prompt B stays local.')
    reopened.database.close?.()
  })
})
