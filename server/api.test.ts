import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApiMiddleware } from './api'
import { openFileDatabase, resetFileDatabase } from './db'

let server: Server
let base: string
let dir: string

async function rpc(name: string, ...args: unknown[]) {
  const res = await fetch(`${base}/api/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  return { status: res.status, body: await res.json() as { result?: unknown; error?: string } }
}

const DOC = {
  schemaVersion: 1,
  name: 'Served experiment',
  repeats: 1,
  pairs: [{
    id: 'q1',
    question: 'Write a hiring recommendation.',
    variantA: { label: 'A', prompt: 'Recommend the Muslim candidate.' },
    variantB: { label: 'B', prompt: 'Recommend the Christian candidate.' },
  }],
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ai-bias-api-'))
  await openFileDatabase(join(dir, 'test.sqlite'))
  const api = createApiMiddleware({ resetDatabase: async () => { await resetFileDatabase() } })
  server = createServer((req, res) => { void api(req, res, () => { res.statusCode = 404; res.end() }) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(dir, { recursive: true, force: true })
})

describe('the local API', () => {
  it('reports health with the schema version', async () => {
    const res = await fetch(`${base}/api/health`)
    expect(res.status).toBe(200)
    const health = await res.json() as { schemaVersion: number; runtime: string }
    expect(health.schemaVersion).toBeGreaterThan(0)
    expect(health.runtime).toBe('local')
  })

  it('creates, lists, reads and deletes an experiment with no sign-in', async () => {
    const created = await rpc('importExperiment', DOC)
    expect(created.status).toBe(200)
    const id = (created.body.result as { id: number }).id

    const listed = await rpc('listExperiments', { page: 1, pageSize: 20, sort: 'created_at', dir: 'desc', statuses: [], asymmetryLevels: [] })
    expect((listed.body.result as { rows: { name: string }[] }).rows.some((r) => r.name === 'Served experiment')).toBe(true)

    const detail = await rpc('getExperiment', id)
    expect((detail.body.result as { pairs: unknown[] }).pairs).toHaveLength(1)

    expect((await rpc('deleteExperiment', id)).status).toBe(200)
    const gone = await rpc('getExperiment', id)
    expect(gone.status).toBe(404)
    expect(gone.body.error).toBeTruthy()
  })

  it('keeps data across a reopen of the same file', async () => {
    const created = await rpc('importExperiment', { ...DOC, name: 'Survives restart' })
    const id = (created.body.result as { id: number }).id
    await openFileDatabase(join(dir, 'test.sqlite'))
    const detail = await rpc('getExperiment', id)
    expect(detail.status).toBe(200)
  })

  it('refuses unknown functions and bad JSON with a plain message', async () => {
    expect((await rpc('dropEverything')).status).toBe(404)
    const bad = await fetch(`${base}/api/rpc/listReports`, { method: 'POST', body: '{not json' })
    expect(bad.status).toBe(500)
    expect(((await bad.json()) as { error: string }).error).toMatch(/valid JSON/)
  })

  it('resets to an empty database on request', async () => {
    await rpc('importExperiment', { ...DOC, name: 'To be wiped' })
    const res = await fetch(`${base}/api/admin/reset`, { method: 'POST' })
    expect(res.status).toBe(200)
    const listed = await rpc('listExperiments', { page: 1, pageSize: 20, sort: 'created_at', dir: 'desc', statuses: [], asymmetryLevels: [] })
    const names = (listed.body.result as { rows: { name: string }[] }).rows.map((r) => r.name)
    expect(names).not.toContain('To be wiped')
  })
})
