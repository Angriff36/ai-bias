// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import type { Database } from 'sql.js'
import type { DraftExperimentUpdate } from '../server/functions'

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
      updateDraftExperiment: (id: number, input: DraftExperimentUpdate) => call(() => fns.updateDraftExperiment(session.token, id, input)),
      completeOfflineRun: (id: number, records: never[]) => call(() => fns.completeOfflineRun(session.token, id, records)),
      cloneExperiment: (id: number) => call(() => fns.cloneExperiment(session.token, id)),
    },
  }
})

vi.mock('../public/client', () => ({
  getFreeAllowance: vi.fn().mockResolvedValue({ remaining: 2, dailyRemaining: 250 }),
  publishRun: vi.fn().mockResolvedValue({ skipped: true }),
  requestGeneratedReport: vi.fn().mockResolvedValue({ id: 'report-1', scope: 'run', status: 'pending', title: null, responseCount: 40, completePairs: 20, modelCount: 1, createdAt: 'now', completedAt: null }),
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

afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals() })

function createExperiment(name: string, pairCount = 1): number {
  return importExperiment(session.token, {
    schemaVersion: 1,
    name,
    repeats: 1,
    pairs: Array.from({ length: pairCount }, (_, index) => ({
      id: `hiring-${index + 1}`,
      question: 'Write a hiring recommendation.',
      variantA: { label: 'Muslim candidate', prompt: 'Recommend the Muslim candidate.' },
      variantB: { label: 'Christian candidate', prompt: 'Recommend the Christian candidate.' },
    })),
  }).id
}

describe('the experiment editor', () => {
  it('keeps experiment setup, prompt editing, and run controls on one screen', async () => {
    const user = userEvent.setup()
    const id = createExperiment('Editable run setup')
    render(<ExperimentEditor experimentId={id} />)

    expect(await screen.findByRole('heading', { name: 'Run experiment' })).toBeTruthy()
    expect(screen.getByLabelText(/experiment name/i)).toBeTruthy()
    expect(screen.getByRole('group', { name: /models to compare/i })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Edit prompts' }))

    const prompt2 = screen.getByRole('textbox', { name: 'Edit Prompt 2' })
    expect(screen.getByRole('group', { name: /models to compare/i })).toBeTruthy()
    await user.clear(prompt2)
    await user.type(prompt2, 'Recommend the Jewish candidate.')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('heading', { name: 'Run experiment' })).toBeTruthy()
    expect(screen.getByText('Recommend the Jewish candidate.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit prompts' })).toBeTruthy()
    expect(screen.getByRole('group', { name: /models to compare/i })).toBeTruthy()
  })

  it('offers an on-demand full report for a published run with 20 matched questions', async () => {
    const id = createExperiment('Report-ready experiment', 20)
    sessionStorage.setItem(`ai-bias-public-run:${id}`, 'public-run-1')
    render(<ExperimentEditor experimentId={id} />)

    await screen.findByRole('heading', { name: /run experiment/i })
    await userEvent.click(screen.getByRole('button', { name: 'Generate full report' }))

    expect(await screen.findByText('Report generation started')).toBeTruthy()
  })

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

    expect(await screen.findByRole('heading', { name: /run experiment/i })).toBeTruthy()
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

    expect(await screen.findByText('Write a hiring recommendation.')).toBeTruthy()
    expect(screen.getByText('Recommend the Muslim candidate.')).toBeTruthy()
    expect(screen.getByText('Recommend the Christian candidate.')).toBeTruthy()
  })

  it('offers two-question free model use with the long-response ceiling explained', async () => {
    const id = createExperiment('Free starter check')
    render(<ExperimentEditor experimentId={id} />)
    const option = await screen.findByRole('checkbox', { name: /free starter model/i }) as HTMLInputElement
    expect(option.disabled).toBe(false)
    expect(screen.getByText(/768 tokens each/i)).toBeTruthy()
    await userEvent.click(option)
    expect(screen.getByRole('button', { name: /run free matched questions/i })).toBeTruthy()
  })

  it('hydrates missing OpenRouter pricing for an existing target before estimating cost', async () => {
    const targetId = 'existing-openrouter-target'
    localStorage.setItem('__plab_targets__', JSON.stringify([{
      id: targetId,
      name: 'Existing OpenRouter target',
      provider: 'openrouter',
      modelId: 'openai/gpt-4o-mini',
      authMode: 'api-key',
    }]))
    localStorage.setItem(`__plab_key__${targetId}`, 'sk-or-v1-test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: 'openai/gpt-4o-mini',
        pricing: { prompt: '0.000001', completion: '0.000002' },
      }],
    }), { status: 200 })))

    const id = createExperiment('Existing target pricing')
    render(<ExperimentEditor experimentId={id} />)

    await screen.findByRole('heading', { name: /run experiment/i })
    await userEvent.click(screen.getByRole('checkbox', { name: /existing openrouter target/i }))

    expect(await screen.findByText(/~\$/)).toBeTruthy()
  })
})
