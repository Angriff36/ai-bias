import initSqlJs from 'sql.js'
import { describe, expect, it, vi } from 'vitest'
import type { BrowserDatabaseStorage } from './database'
import { createBrowserApi } from './api'

class MemoryDatabaseStorage implements BrowserDatabaseStorage {
  bytes: Uint8Array | null = null
  async load() { return this.bytes?.slice() ?? null }
  async save(bytes: Uint8Array) { this.bytes = bytes.slice() }
  async clear() { this.bytes = null }
}

describe('browser API', () => {
  it('creates and reads an experiment without making a same-origin server request', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
    const api = createBrowserApi(new MemoryDatabaseStorage(), () => initSqlJs())

    expect(await api.health()).toEqual({ ok: true, schemaVersion: 10, runtime: 'browser-local' })
    const created = await api.importExperiment({
      schemaVersion: 1,
      name: 'No cloud database',
      repeats: 1,
      pairs: [{
        id: 'q1',
        question: 'Where is this saved?',
        variantA: { label: 'A', prompt: 'Only in browser A' },
        variantB: { label: 'B', prompt: 'Only in browser B' },
      }],
    })
    const loaded = await api.getExperiment(created.id)

    expect(loaded.name).toBe('No cloud database')
    expect(loaded.pairs[0].variantB.prompt).toBe('Only in browser B')
    expect(fetcher).not.toHaveBeenCalled()
    fetcher.mockRestore()
  })
})
