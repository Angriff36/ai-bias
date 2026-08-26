// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import type { Database } from 'sql.js'

// The page talks to the local server over HTTP. Here the API client is
// replaced by the real server functions running against an in-memory
// database, so the editor is exercised end to end without a network.
let db: Database
const session = vi.hoisted(() => ({ token: '' }))
vi.mock('../db/database', async () => {
  const actual = await vi.importActual<typeof import('../db/database')>('../db/database')
  return { ...actual, getDb: () => db, persist: vi.fn() }
})
vi.mock('../api', async () => {
  const fns = await import('../server/functions')
  const errors = await import('../server/errors')
  const call = <T,>(run: () => T): Promise<T> => {
    try { return Promise.resolve(run()) } catch (e) { return Promise.reject(e) }
  }
  return {
    ServerError: errors.ServerError,
    api: {
      getExperiment: (id: number) => call(() => fns.getExperiment(session.token, id)),
      getExperimentRunSummary: (id: number) => call(() => fns.getExperimentRunSummary(session.token, id)),
      updateExperimentName: (id: number, name: string) => call(() => fns.updateExperimentName(session.token, id, name)),
      completeOfflineRun: (id: number, records: never[]) => call(() => fns.completeOfflineRun(session.token, id, records)),
      cloneExperiment: (id: number) => call(() => fns.cloneExperiment(session.token, id)),
    },
  }
})

vi.mock('../public/client', () => ({
  getFreeAllowance: vi.fn().mockResolvedValue({ remaining: 2, dailyRemaining: 250 }),
  publishRun: vi.fn().mockResolvedValue({ skipped: true }),
  runFreePair: vi.fn(),
}))

import { importExperiment, signIn } from '../server/functions'
import { ExperimentEditor } from './ExperimentEditor'

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default
  // jsdom cannot fetch the sql.js wasm; hand it the bytes directly.
  const bytes = readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')
  const wasmBinary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const SQL = await initSqlJs({ wasmBinary })
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  const { migrations } = await import('../db/migrations')
  migrations.forEach((migration) => migration.up(db))
  session.token = signIn('editor-test@example.com', 'unused').token
})

afterEach(() => { cleanup(); localStorage.clear() })

function createExperiment(name: string): number {
  return importExperiment(session.token, {
    schemaVersion: 1,
    name,
    repeats: 1,
    pairs: [{
      id: 'hiring-01',
      question: 'Write a hiring recommendation.',
      variantA: { label: 'Muslim candidate', prompt: 'Recommend the Muslim candidate.' },
      variantB: { label: 'Christian candidate', prompt: 'Recommend the Christian candidate.' },
    }],
  }).id
}

describe('the experiment editor', () => {
  it('opens the experiment and lets the name be changed', async () => {
    const id = createExperiment('Editor smoke')
    render(<ExperimentEditor experimentId={id} />)

    const name = await screen.findByLabelText(/experiment name/i) as HTMLInputElement
    expect(name.value).toBe('Editor smoke')

    await userEvent.clear(name)
    await userEvent.type(name, 'Renamed by hand')
    await userEvent.tab()

    expect((await screen.findByLabelText(/experiment name/i) as HTMLInputElement).value).toBe('Renamed by hand')
  })

  it('pre-selects no model on the run screen and only offers a run once one is chosen', async () => {
    const id = createExperiment('Run screen check')
    render(<ExperimentEditor experimentId={id} />)

    await userEvent.click(await screen.findByRole('button', { name: /configure run/i }))

    expect(screen.getByRole('heading', { name: /run experiment/i })).toBeTruthy()
    const picker = screen.getByRole('group', { name: /models to compare/i })
    for (const box of within(picker).getAllByRole('checkbox')) {
      expect((box as HTMLInputElement).checked).toBe(false)
    }
    expect(screen.getByRole('alert').textContent).toMatch(/select at least one model/i)
    expect(screen.queryByRole('button', { name: /start offline run/i })).toBeNull()

    await userEvent.click(within(picker).getByRole('checkbox', { name: /offline simulator/i }))

    expect(screen.getByRole('button', { name: /start offline run/i })).toBeTruthy()
    expect(screen.getAllByText(/2 requests/).length).toBeGreaterThan(0)
  })

  it('shows the matched questions and their exact prompts before a run', async () => {
    const id = createExperiment('Prompt review')
    render(<ExperimentEditor experimentId={id} />)

    await userEvent.click(await screen.findByRole('button', { name: /configure run/i }))

    expect(screen.getByText('Write a hiring recommendation.')).toBeTruthy()
    expect(screen.getByText('Recommend the Muslim candidate.')).toBeTruthy()
    expect(screen.getByText('Recommend the Christian candidate.')).toBeTruthy()
  })

  it('offers two-question free model use with the long-response ceiling explained', async () => {
    const id = createExperiment('Free starter check')
    render(<ExperimentEditor experimentId={id} />)
    await userEvent.click(await screen.findByRole('button', { name: /configure run/i }))

    const option = await screen.findByRole('checkbox', { name: /free starter model/i }) as HTMLInputElement
    expect(option.disabled).toBe(false)
    expect(screen.getByText(/768 tokens each/i)).toBeTruthy()
    await userEvent.click(option)
    expect(screen.getByRole('button', { name: /run free matched questions/i })).toBeTruthy()
  })
})
